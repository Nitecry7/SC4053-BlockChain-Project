/**
 * Short, beginner-facing explanations shown by the information icons (`components/ui/info-tip.tsx`). Every sentence was checked
 * against `OrderBook.sol`, SPEC.md and the Beginner's Guide: eligibility (the last trade meets the trigger), activation (someone
 * sends `triggerStopOrders`) and execution (the activated order trades) are three different things and are never merged here.
 * `guide` is a plain-text pointer, not a link: the app does not serve the repository's documents.
 */
export type GlossaryKey =
  | "limitOrder"
  | "stopLimitOrder"
  | "triggerPrice"
  | "limitPrice"
  | "escrow"
  | "pendingTrigger"
  | "resting"
  | "eligibleNow"
  | "triggerStops"
  | "matchOrders"
  | "marketBoard"
  | "orderBook"
  | "marketDepth"
  | "bidAsk"
  | "spread"
  | "crossedBook"
  | "lastTradePrice"
  | "tokenIssuance"
  | "marketListing"
  | "gas"
  | "allowance"
  | "connectedAccount";

export type GlossaryEntry = { term: string; text: string; guide?: string };

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  limitOrder: {
    term: "Limit Order",
    text: "An order to buy at or below your chosen price, or sell at or above it. It may fill immediately, fill partly, or rest on the Order Book until it trades or you cancel it.",
    guide: "Beginner's Guide, Part G",
  },
  stopLimitOrder: {
    term: "Stop-Limit Order",
    text: "An order that waits, outside the Order Book, for the market's last trade price to reach your trigger. Reaching it only makes the order eligible. Someone must then send a Trigger Stops transaction, and even then the order may not trade.",
    guide: "Beginner's Guide, Part G8",
  },
  triggerPrice: {
    term: "Trigger Price",
    text: "The last trade price that makes a stop eligible: a sell stop at or below it, a buy stop at or above it. Eligible is not activated: activation needs a separate transaction.",
    guide: "Beginner's Guide, Part G8",
  },
  limitPrice: {
    term: "Limit Price",
    text: "The most you will pay when buying, or the least you will accept when selling. Trades happen at the resting order's price, which can be better than your limit.",
  },
  escrow: {
    term: "Escrow",
    text: "Tokens the smart contract holds for your order until they are traded or refunded. A sell escrows the base token; a buy escrows the quote token, worked out at your limit price.",
  },
  pendingTrigger: {
    term: "Pending Trigger",
    text: "A stop-limit order that has not activated yet. Its tokens are escrowed, but it is not on the Order Book and cannot trade.",
  },
  resting: {
    term: "Resting",
    text: "The order is on the Order Book waiting for a match (the engine's Open status). Part of it may already be filled.",
  },
  eligibleNow: {
    term: "Eligible Now",
    text: "The last trade price already meets this stop's trigger. The order is still Pending Trigger, with its tokens escrowed, until someone sends a Trigger Stops transaction. It does not need another trade.",
    guide: "Beginner's Guide, Part G8",
  },
  triggerStops: {
    term: "Trigger Stops",
    text: "Lets anyone activate eligible stop orders. The caller pays gas but does not need to own the orders or hold any trading tokens. Activation is not execution: each activated order then trades, rests on the book, or is refunded.",
    guide: "Beginner's Guide, Part G8",
  },
  matchOrders: {
    term: "Match Orders",
    text: "Lets anyone settle compatible resting buy and sell orders (a crossed book) by paying gas. It is needed when one order hit the limit of 10 fills in a single transaction.",
    guide: "Beginner's Guide, Part G7",
  },
  marketBoard: {
    term: "Market Board",
    text: "The markets listed through MarketFactory, with each market's last trade, best bid and best ask.",
  },
  orderBook: {
    term: "Order Book",
    text: "The active buy (bid) and sell (ask) orders waiting to be matched. Pending stop-limit orders are not part of it.",
  },
  marketDepth: {
    term: "Market Depth",
    text: "The buy and sell quantities currently available at each price level on the Order Book.",
  },
  bidAsk: {
    term: "Best Bid and Best Ask",
    text: "The best bid is the highest price a buyer is offering; the best ask is the lowest price a seller will accept.",
  },
  spread: {
    term: "Spread",
    text: "The gap between the best ask and the best bid. If the best bid is at or above the best ask, the book is crossed.",
  },
  crossedBook: {
    term: "Crossed Book",
    text: "The best bid is at or above the best ask, so some orders could trade but have not been matched yet. Anyone can settle them with Match Orders.",
    guide: "Beginner's Guide, Part G7",
  },
  lastTradePrice: {
    term: "Last Trade Price",
    text: "The price of the most recent trade on this market. Stop orders use it, not an outside price feed. It does not exist until the first trade.",
  },
  tokenIssuance: {
    term: "Token Issuance",
    text: "Creates a new ERC20 token through TokenFactory: 18 decimals and a fixed supply, all sent to your account.",
  },
  marketListing: {
    term: "Market Listing",
    text: "Opens an Order Book for a pair of tokens through MarketFactory. A pair can have only one market.",
  },
  gas: {
    term: "Gas",
    text: "The fee for running a transaction, paid in the chain's own currency (free test ETH on Anvil). Reading data costs nothing.",
  },
  allowance: {
    term: "ERC20 Allowance",
    text: "A permission for the order book to pull a set amount of one token from your wallet. It is a separate transaction from placing the order.",
  },
  connectedAccount: {
    term: "Connected Account",
    text: "The account this site is connected to. Choosing another account in MetaMask does not change it until you connect that account to this site.",
    guide: "Beginner's Guide, Part F",
  },
};
