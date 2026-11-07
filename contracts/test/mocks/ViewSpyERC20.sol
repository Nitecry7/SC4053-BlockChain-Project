// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IOrderBook} from "../../src/interfaces/IOrderBook.sol";
import {MockERC20} from "./MockERC20.sol";
import {OrderBookHarness} from "./OrderBookHarness.sol";

/// @dev Test token: on its first balance change once armed, records what the book's views show at that moment.
contract ViewSpyERC20 is MockERC20 {
    struct Snapshot {
        bool taken;
        bool hasTradePrice;
        uint256 lastTradePrice;
        IOrderBook.Status makerStatus;
        uint256 makerFilled;
        IOrderBook.Status takerStatus;
        uint256 sellHead;
        uint256 buyHead;
        uint256 makerLockedQuote;
    }

    OrderBookHarness private _book;
    uint256 private _makerId;
    uint256 private _takerId;
    Snapshot public snapshot;

    constructor(string memory name_, string memory symbol_) MockERC20(name_, symbol_, 18) {}

    function arm(OrderBookHarness book, uint256 makerId, uint256 takerId) external {
        _book = book;
        _makerId = makerId;
        _takerId = takerId;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (address(_book) != address(0) && !snapshot.taken) {
            snapshot = Snapshot({
                taken: true,
                hasTradePrice: _book.hasTradePrice(),
                lastTradePrice: _book.lastTradePrice(),
                makerStatus: _book.getOrder(_makerId).status,
                makerFilled: _book.getOrder(_makerId).filled,
                takerStatus: _book.getOrder(_takerId).status,
                sellHead: _book.bookHead(IOrderBook.Side.Sell),
                buyHead: _book.bookHead(IOrderBook.Side.Buy),
                makerLockedQuote: _book.getOrder(_makerId).lockedQuote
            });
        }
        super._update(from, to, value);
    }
}
