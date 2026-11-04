// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OrderBook} from "./OrderBook.sol";

/// @notice Permissionless factory and on-chain registry of OrderBook markets (brief section 5.1, "token listing").
/// @dev Deploys `new OrderBook(base, quote)` unmodified, one market per unordered token pair. There is no owner, no
/// admin function and no pause, and the factory never holds tokens. Traders call each OrderBook directly, so the
/// factory is never `msg.sender` of an order. Token validity (non-zero, distinct, 18 decimals) is enforced by the
/// OrderBook constructor, and its reverts pass through unchanged.
///
/// No reentrancy guard is needed: the only external calls made while creating a market are the constructor's
/// `decimals()` reads, which compile to STATICCALL, so the token cannot re-enter this contract's state-changing code.
/// `test_createMarket_tokenCannotReenterFromDecimals` pins that.
contract MarketFactory {
    address[] private _markets;
    mapping(bytes32 pairKey => address market) private _marketOfPair;
    mapping(address market => bool) private _isMarket;

    event MarketCreated(address indexed market, address indexed base, address indexed quote, address creator);

    /// @dev The pair (or its reverse) already has a market.
    error MarketExists(address market);

    /// @dev The first creator fixes which token is the base and which is the quote. The reversed pair is rejected,
    /// because it would be the same market with inverted prices and would split its liquidity.
    function createMarket(address base, address quote) external returns (address market) {
        bytes32 key = _pairKey(base, quote);
        address existing = _marketOfPair[key];
        if (existing != address(0)) revert MarketExists(existing);

        market = address(new OrderBook(base, quote));
        _marketOfPair[key] = market;
        _isMarket[market] = true;
        _markets.push(market);

        emit MarketCreated(market, base, quote, msg.sender);
    }

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    /// @dev Order-insensitive: (a, b) and (b, a) give the same answer. Returns address(0) when there is no market.
    function getMarket(address tokenA, address tokenB) external view returns (address) {
        return _marketOfPair[_pairKey(tokenA, tokenB)];
    }

    function isMarket(address market) external view returns (bool) {
        return _isMarket[market];
    }

    /// @dev Oldest first. Returns at most `limit` entries, fewer near the end, and an empty array when
    /// `offset >= marketCount()`. Never reverts, and the loop is bounded by the number of entries returned.
    function getMarkets(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = _markets.length;
        if (offset >= total) return new address[](0);

        uint256 remaining = total - offset;
        uint256 count = limit < remaining ? limit : remaining;

        page = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = _markets[offset + i];
        }
    }

    function _pairKey(address a, address b) private pure returns (bytes32) {
        (address low, address high) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encode(low, high));
    }
}
