// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IOrderBook} from "./interfaces/IOrderBook.sol";

/// @notice Limit order book for one base/quote pair. Behaviour is defined in SPEC.md.
/// @dev Phase 1 skeleton: function bodies are stubs until their phase in docs/ENGINE_PHASES.md.
contract OrderBook is IOrderBook, ReentrancyGuard {
    uint256 public constant PRICE_SCALE = 1e18;
    uint256 public constant LOT_SIZE = 1e9;
    uint256 public constant TICK_SIZE = 1e9;
    uint256 public constant MAX_MATCHES_PER_TX = 10;
    uint256 public constant MAX_INSERT_SCAN = 100;

    address public immutable baseToken;
    address public immutable quoteToken;

    uint256 public lastTradePrice;
    bool public hasTradePrice;

    uint256 internal _nextOrderId = 1;
    mapping(uint256 orderId => Order) internal _orders;
    mapping(address trader => uint256[] orderIds) internal _userOrderIds;

    constructor(address base, address quote) {
        if (base == address(0) || quote == address(0) || base == quote) revert InvalidTokens();
        if (IERC20Metadata(base).decimals() != 18 || IERC20Metadata(quote).decimals() != 18) {
            revert UnsupportedDecimals();
        }
        baseToken = base;
        quoteToken = quote;
    }

    function placeLimitOrder(Side, uint256, uint256) external nonReentrant returns (uint256) {
        revert();
    }

    function cancelOrder(uint256) external nonReentrant {
        revert();
    }

    function matchOrders(uint256) external nonReentrant returns (uint256) {
        revert();
    }

    function placeStopLimitOrder(Side, uint256, uint256, uint256) external nonReentrant returns (uint256) {
        revert();
    }

    function triggerStopOrders(uint256) external nonReentrant returns (uint256) {
        revert();
    }

    function getOrder(uint256) external view returns (Order memory) {
        revert();
    }

    function getBestBid() external view returns (uint256, uint256) {
        revert();
    }

    function getBestAsk() external view returns (uint256, uint256) {
        revert();
    }

    function getBook(Side, uint256) external view returns (Order[] memory) {
        revert();
    }

    function getUserOrderIds(address) external view returns (uint256[] memory) {
        revert();
    }

    function requiredQuote(uint256, uint256) external pure returns (uint256) {
        revert();
    }
}
