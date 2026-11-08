// Test-only helpers: SYNTHETIC logs built with viem's own event encoders (not captured from a chain).
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { demoTokenAbi, marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "@/lib/contracts/abis";

export const E18 = 10n ** 18n;
/** "2.2" -> 2.2e18 exactly. */
export const dec = (s: string) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};

export const MARKET = "0xCafac3dD18aC6c6e92c921884f9E4176737C052c" as Address;
export const NTU = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be" as Address;
export const SGDX = "0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968" as Address;
export const ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
export const BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
export const EVIL = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;

export type TestLog = { address: Address; topics: [Hex, ...Hex[]]; data: Hex; logIndex: number };
let idx = 0;
export const resetLogIndex = () => {
  idx = 0;
};

export const orderPlaced = (address: Address, orderId: bigint, trader: Address, side: 0 | 1, price: bigint, amount: bigint): TestLog => ({
  address,
  topics: encodeEventTopics({ abi: orderBookAbi, eventName: "OrderPlaced", args: { orderId, trader } }) as [Hex, ...Hex[]],
  data: encodeAbiParameters([{ type: "uint8" }, { type: "uint256" }, { type: "uint256" }], [side, price, amount]),
  logIndex: idx++,
});

export const orderCancelled = (address: Address, orderId: bigint, trader: Address, refundBase: bigint, refundQuote: bigint): TestLog => ({
  address,
  topics: encodeEventTopics({ abi: orderBookAbi, eventName: "OrderCancelled", args: { orderId, trader } }) as [Hex, ...Hex[]],
  data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [refundBase, refundQuote]),
  logIndex: idx++,
});

export const stopOrderPlaced = (address: Address, orderId: bigint, trader: Address, side: 0 | 1, triggerPrice: bigint, limitPrice: bigint, amount: bigint): TestLog => ({
  address,
  topics: encodeEventTopics({ abi: orderBookAbi, eventName: "StopOrderPlaced", args: { orderId, trader } }) as [Hex, ...Hex[]],
  data: encodeAbiParameters([{ type: "uint8" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [side, triggerPrice, limitPrice, amount]),
  logIndex: idx++,
});

export const stopOrderTriggered = (address: Address, orderId: bigint, lastTradePrice: bigint): TestLog => ({
  address,
  topics: encodeEventTopics({ abi: orderBookAbi, eventName: "StopOrderTriggered", args: { orderId } }) as [Hex, ...Hex[]],
  data: encodeAbiParameters([{ type: "uint256" }], [lastTradePrice]),
  logIndex: idx++,
});

export const trade = (
  address: Address,
  makerOrderId: bigint,
  takerOrderId: bigint,
  maker: Address,
  taker: Address,
  price: bigint,
  base: bigint,
  quote: bigint,
): TestLog => ({
  address,
  topics: encodeEventTopics({ abi: orderBookAbi, eventName: "Trade", args: { makerOrderId, takerOrderId } }) as [Hex, ...Hex[]],
  data: encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [maker, taker, price, base, quote],
  ),
  logIndex: idx++,
});

export const transfer = (token: Address, from: Address, to: Address, value: bigint): TestLog => ({
  address: token,
  topics: encodeEventTopics({ abi: demoTokenAbi, eventName: "Transfer", args: { from, to } }) as [Hex, ...Hex[]],
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
  logIndex: idx++,
});

export const approval = (token: Address, owner: Address, spender: Address, value: bigint): TestLog => ({
  address: token,
  topics: encodeEventTopics({ abi: demoTokenAbi, eventName: "Approval", args: { owner, spender } }) as [Hex, ...Hex[]],
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
  logIndex: idx++,
});

/** Bob's buy of 4 @ limit 2.2 against Alice's resting sell (order 1: 10 @ 2.0): the SPEC worked example, as logs. */
export function specExampleLogs(): TestLog[] {
  resetLogIndex();
  return [
    transfer(SGDX, BOB, MARKET, dec("8.8")), // escrow pulled: ceil(4 * 2.2)
    orderPlaced(MARKET, 2n, BOB, 0, dec("2.2"), dec("4")),
    trade(MARKET, 1n, 2n, ALICE, BOB, dec("2"), dec("4"), dec("8")),
    transfer(NTU, MARKET, BOB, dec("4")), // buyer receives base
    transfer(SGDX, MARKET, ALICE, dec("8")), // seller paid at the maker price
    transfer(SGDX, MARKET, BOB, dec("0.8")), // buyer's price-improvement refund
  ];
}

export const TOKEN_FACTORY = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
export const MARKET_FACTORY = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as Address;
export const NEW_TOKEN = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as Address;
export const NEW_MARKET = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9" as Address;

export const tokenCreated = (factory: Address, token: Address, creator: Address, name: string, symbol: string, supply: bigint): TestLog => ({
  address: factory,
  topics: encodeEventTopics({ abi: tokenFactoryAbi, eventName: "TokenCreated", args: { token, creator } }) as [Hex, ...Hex[]],
  data: encodeAbiParameters([{ type: "string" }, { type: "string" }, { type: "uint256" }], [name, symbol, supply]),
  logIndex: idx++,
});

export const marketCreated = (factory: Address, market: Address, base: Address, quote: Address, creator: Address): TestLog => ({
  address: factory,
  topics: encodeEventTopics({ abi: marketFactoryAbi, eventName: "MarketCreated", args: { market, base, quote } }) as [Hex, ...Hex[]],
  data: encodeAbiParameters([{ type: "address" }], [creator]),
  logIndex: idx++,
});
