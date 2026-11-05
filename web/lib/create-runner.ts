import type { Abi, Address, Hex, PublicClient } from "viem";
import { demoTokenAbi, marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "./contracts/abis";
import type { ValidToken } from "./create-input";
import { describeTxError } from "./errors";
import type { FlowContext, FlowEvent } from "./order-flow";
import { fail, viemDeps, waitBounded, type ContractCall, type ReceiptLike, type RunnerDeps } from "./order-runner";
import { decodeMarketCreated, decodeTokenCreated, type MarketCreatedEvent, type TokenCreatedEvent } from "./receipt";

/** The chain and wallet operations a creation needs: simulate, sign, wait, and read back what the receipt claims. */
export type CreateDeps = Pick<RunnerDeps, "simulate" | "write" | "waitForReceipt"> & {
  read: (call: ContractCall, blockNumber?: bigint) => Promise<unknown>;
};

export type CreateParams = { ctx: FlowContext; attempt: number; windowMs?: number; maxWindows?: number };

export type DecodeResult<D> = { ok: true; decoded: D } | { ok: false; title: string; detail: string };
export type VerifyResult<R> = { ok: true; result: R } | { ok: false; problems: string[] };

/** One creation: the factory call, how to read and bind its event, and how to verify it on-chain. */
export type CreateSpec<D, R> = {
  call: ContractCall;
  decode: (receipt: ReceiptLike) => DecodeResult<D>;
  verify: (deps: CreateDeps, decoded: D, receipt: ReceiptLike) => Promise<VerifyResult<R>>;
  /** Added to a simulation revert that carries no error name (for example "the address is not a token"). */
  emptyRevertHint?: string;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const REGISTRY_WINDOW = 50n;

/**
 * Drives one factory call through the same lifecycle as an order (simulate, wallet, confirmation, verification) using
 * the P2-5 reducer events. Success (`RECONCILED`) needs all of: a successful receipt, a factory event that matches the
 * request, and independent on-chain reads that agree with it. A hash, a simulated return value or an event alone is
 * never success.
 */
export async function runCreate<D, R>(
  deps: CreateDeps,
  spec: CreateSpec<D, R>,
  p: CreateParams,
  dispatch: (event: FlowEvent<R>) => void,
  isCurrent: () => boolean,
): Promise<void> {
  let hash: Hex | undefined;
  try {
    try {
      await deps.simulate(spec.call, p.ctx.account);
    } catch (e) {
      if (!isCurrent()) return;
      const described = describeTxError(e);
      const hint = described.kind === "reverted" && described.errorName === undefined ? spec.emptyRevertHint : undefined;
      return dispatch({ type: "FAILED", attempt: p.attempt, failure: { ...described, detail: hint ?? described.detail, step: "order" } });
    }
    if (!isCurrent()) return;
    dispatch({ type: "SIMULATION_OK", attempt: p.attempt });

    hash = await deps.write(spec.call, p.ctx.account, p.ctx.chainId);
    dispatch({ type: "ORDER_SUBMITTED", attempt: p.attempt, hash });
    if (!isCurrent()) return;

    const receipt = await waitBounded<R>(
      deps,
      hash,
      p,
      (e) => {
        if (e.type === "HASH_REPLACED") hash = e.hash; // later failures link the transaction that is actually pending
        dispatch(e);
      },
      isCurrent,
    );
    if (!isCurrent()) return;

    if (receipt.status !== "success") {
      let reason: unknown = new Error("The transaction reverted on-chain and the reason could not be recovered.");
      try {
        await deps.simulate(spec.call, p.ctx.account, receipt.blockNumber - 1n);
      } catch (e) {
        reason = e;
      }
      const described = describeTxError(reason);
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: {
          ...described,
          kind: "reverted",
          title: `Reverted on-chain: ${described.title}`,
          detail: "The transaction was mined and reverted, so nothing was created. Only gas was spent.",
          step: "order",
          hash,
        },
      });
    }
    dispatch({ type: "ORDER_MINED", attempt: p.attempt });

    const decoded = spec.decode(receipt);
    if (!decoded.ok) {
      return dispatch({ type: "FAILED", attempt: p.attempt, failure: { kind: "unknown", title: decoded.title, detail: decoded.detail, step: "order", hash } });
    }

    let verified: VerifyResult<R>;
    try {
      verified = await spec.verify(deps, decoded.decoded, receipt);
    } catch (e) {
      if (!isCurrent()) return;
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: {
          kind: "unknown",
          title: "Mined, but the result could not be read back",
          detail: `The transaction was confirmed, but reading the result from the chain failed (${describeTxError(e).detail}). Check the Tokens and Markets pages before trying again.`,
          step: "order",
          hash,
        },
      });
    }
    if (!isCurrent()) return;
    if (!verified.ok) {
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: {
          kind: "unknown",
          title: "Mined, but the result could not be verified",
          detail: `The chain does not agree with the transaction's own event: ${verified.problems.join(" ")} Open the transaction page to inspect it.`,
          step: "order",
          hash,
        },
      });
    }
    dispatch({ type: "RECONCILED", attempt: p.attempt, result: verified.result });
  } catch (e) {
    if (isCurrent()) fail<R>(dispatch, p.attempt, "order", e, hash);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Token issuance

export type TokenOutcome = {
  hash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  token: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  /** `balanceOf(creator)` at the receipt block and now. */
  creatorBalanceAtBlock: bigint;
  creatorBalanceNow: bigint;
  /** Position in `TokenFactory.getTokens` (oldest first) and the registry size at the receipt block. */
  registryIndex: bigint;
  registryCount: bigint;
};

const call = (address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): ContractCall => ({ address, abi, functionName, args });

/** `createToken`: the event must match the request exactly, then the token is read back from the chain. */
export function tokenSpec(input: { factory: Address; creator: Address; token: Pick<ValidToken, "name" | "symbol" | "supply"> }): CreateSpec<TokenCreatedEvent, TokenOutcome> {
  const { factory, creator, token } = input;
  return {
    call: call(factory, tokenFactoryAbi as Abi, "createToken", [token.name, token.symbol, token.supply]),
    decode: (receipt) => {
      const r = decodeTokenCreated({ logs: receipt.logs, factory, creator });
      if (!r.ok) {
        return {
          ok: false,
          title: "Confirmed, but the new token could not be found",
          detail:
            r.reason === "none"
              ? "The transaction succeeded but its receipt has no TokenCreated event from TokenFactory for your account. Open the transaction page to inspect it."
              : "The receipt has more than one TokenCreated event for your account, so the new token cannot be identified safely. Open the transaction page.",
        };
      }
      const e = r.event;
      if (e.name !== token.name || e.symbol !== token.symbol || e.initialSupply !== token.supply) {
        return {
          ok: false,
          title: "Confirmed, but it is not the token you requested",
          detail: "The token that was created has a different name, symbol or supply than the one you entered. Check the Tokens page before doing anything else.",
        };
      }
      return { ok: true, decoded: e };
    },
    verify: async (deps, e, receipt) => {
      const at = receipt.blockNumber;
      const problems: string[] = [];
      const t = e.token;
      const [isFactory, name, symbol, decimals, totalSupply, balanceAt, count] = (await Promise.all([
        deps.read(call(factory, tokenFactoryAbi as Abi, "isFactoryToken", [t]), at),
        deps.read(call(t, demoTokenAbi as Abi, "name"), at),
        deps.read(call(t, demoTokenAbi as Abi, "symbol"), at),
        deps.read(call(t, demoTokenAbi as Abi, "decimals"), at),
        deps.read(call(t, demoTokenAbi as Abi, "totalSupply"), at),
        deps.read(call(t, demoTokenAbi as Abi, "balanceOf", [creator]), at),
        deps.read(call(factory, tokenFactoryAbi as Abi, "tokenCount"), at),
      ])) as [boolean, string, string, number, bigint, bigint, bigint];
      if (!isFactory) problems.push("TokenFactory does not recognise this address as one of its tokens.");
      if (name !== token.name) problems.push("The token's own name() differs from the request.");
      if (symbol !== token.symbol) problems.push("The token's own symbol() differs from the request.");
      if (Number(decimals) !== 18) problems.push(`The token reports ${decimals} decimals, expected 18.`);
      if (totalSupply !== token.supply) problems.push("totalSupply() differs from the requested supply.");
      if (balanceAt !== token.supply) problems.push("The creator's balance is not the whole supply.");

      const start = count > REGISTRY_WINDOW ? count - REGISTRY_WINDOW : 0n;
      const page = (await deps.read(call(factory, tokenFactoryAbi as Abi, "getTokens", [start, REGISTRY_WINDOW]), at)) as readonly Address[];
      const idx = page.findIndex((a) => same(a, t));
      if (idx < 0) problems.push("The token is not in TokenFactory's registry.");
      if (problems.length > 0) return { ok: false, problems };

      const balanceNow = (await deps.read(call(t, demoTokenAbi as Abi, "balanceOf", [creator]))) as bigint;
      return {
        ok: true,
        result: {
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          token: t,
          name,
          symbol,
          decimals: Number(decimals),
          totalSupply,
          creatorBalanceAtBlock: balanceAt,
          creatorBalanceNow: balanceNow,
          registryIndex: start + BigInt(idx),
          registryCount: count,
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Market listing

export type MarketOutcome = {
  hash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  market: Address;
  base: Address;
  quote: Address;
  registryIndex: bigint;
  registryCount: bigint;
};

/** `createMarket`: the event must match the requested pair AND orientation, then the market is read back. */
export function marketSpec(input: { factory: Address; creator: Address; base: Address; quote: Address }): CreateSpec<MarketCreatedEvent, MarketOutcome> {
  const { factory, creator, base, quote } = input;
  return {
    call: call(factory, marketFactoryAbi as Abi, "createMarket", [base, quote]),
    emptyRevertHint:
      "The order book refused the pair without a reason, which usually means one of the addresses is not an ERC-20 token (its decimals() cannot be read).",
    decode: (receipt) => {
      const r = decodeMarketCreated({ logs: receipt.logs, factory, creator });
      if (!r.ok) {
        return {
          ok: false,
          title: "Confirmed, but the new market could not be found",
          detail:
            r.reason === "none"
              ? "The transaction succeeded but its receipt has no MarketCreated event from MarketFactory for your account. Open the transaction page to inspect it."
              : "The receipt has more than one MarketCreated event for your account, so the new market cannot be identified safely. Open the transaction page.",
        };
      }
      if (!same(r.event.base, base) || !same(r.event.quote, quote)) {
        return {
          ok: false,
          title: "Confirmed, but it is not the market you requested",
          detail: "The market that was created has a different base or quote token (or the opposite orientation). Check the Markets page before doing anything else.",
        };
      }
      return { ok: true, decoded: r.event };
    },
    verify: async (deps, e, receipt) => {
      const at = receipt.blockNumber;
      const m = e.market;
      const problems: string[] = [];
      const [forward, reverse, isMarket, mBase, mQuote, count] = (await Promise.all([
        deps.read(call(factory, marketFactoryAbi as Abi, "getMarket", [base, quote]), at),
        deps.read(call(factory, marketFactoryAbi as Abi, "getMarket", [quote, base]), at),
        deps.read(call(factory, marketFactoryAbi as Abi, "isMarket", [m]), at),
        deps.read(call(m, orderBookAbi as Abi, "baseToken"), at),
        deps.read(call(m, orderBookAbi as Abi, "quoteToken"), at),
        deps.read(call(factory, marketFactoryAbi as Abi, "marketCount"), at),
      ])) as [Address, Address, boolean, Address, Address, bigint];
      if (!same(forward, m) || !same(reverse, m)) problems.push("MarketFactory.getMarket does not return this market for the pair (in both orders).");
      if (!isMarket) problems.push("MarketFactory does not recognise this address as one of its markets.");
      if (!same(mBase, base)) problems.push("The market's own baseToken() is not the requested base token.");
      if (!same(mQuote, quote)) problems.push("The market's own quoteToken() is not the requested quote token.");

      const start = count > REGISTRY_WINDOW ? count - REGISTRY_WINDOW : 0n;
      const page = (await deps.read(call(factory, marketFactoryAbi as Abi, "getMarkets", [start, REGISTRY_WINDOW]), at)) as readonly Address[];
      const idx = page.findIndex((a) => same(a, m));
      if (idx < 0) problems.push("The market is not in MarketFactory's registry.");
      if (problems.length > 0) return { ok: false, problems };

      return {
        ok: true,
        result: {
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          market: m,
          base: mBase,
          quote: mQuote,
          registryIndex: start + BigInt(idx),
          registryCount: count,
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------

/** Real chain operations over a viem public client; the wallet's `writeContract` is supplied by the caller. */
export function viemCreateDeps(publicClient: PublicClient, writeContract: Parameters<typeof viemDeps>[1]): CreateDeps {
  const base = viemDeps(publicClient, writeContract);
  return {
    simulate: base.simulate,
    write: base.write,
    waitForReceipt: base.waitForReceipt,
    read: (c, blockNumber) =>
      publicClient.readContract({ address: c.address, abi: c.abi, functionName: c.functionName, args: c.args, ...(blockNumber !== undefined ? { blockNumber } : {}) } as never),
  };
}
