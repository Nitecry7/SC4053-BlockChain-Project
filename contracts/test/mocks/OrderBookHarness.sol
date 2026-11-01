// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OrderBook} from "../../src/OrderBook.sol";

/// @dev Test-only: exposes OrderBook internals. Adds no behaviour to the engine.
contract OrderBookHarness is OrderBook {
    constructor(address base, address quote) OrderBook(base, quote) {}

    function exposedInsert(uint256 orderId) external {
        _insert(orderId);
    }

    function exposedUnlink(uint256 orderId) external {
        _unlink(orderId);
    }

    function exposedStampBookSeq(uint256 orderId) external {
        _stampBookSeq(orderId);
    }

    function writeOrder(Order calldata order) external {
        _orders[order.id] = order;
    }

    function writeBookSeq(uint256 orderId, uint256 seq) external {
        _bookSeq[orderId] = seq;
    }

    function readOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function bookHead(Side side) external view returns (uint256) {
        return _bookHead[side];
    }

    function bookNext(uint256 orderId) external view returns (uint256) {
        return _bookNext[orderId];
    }

    function bookPrev(uint256 orderId) external view returns (uint256) {
        return _bookPrev[orderId];
    }

    function bookSeq(uint256 orderId) external view returns (uint256) {
        return _bookSeq[orderId];
    }
}
