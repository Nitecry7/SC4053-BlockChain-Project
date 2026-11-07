// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DemoToken} from "./DemoToken.sol";

/// @notice Permissionless issuer of fixed-supply ERC20 tokens (brief section 5.1, "Asset Issuer").
/// @dev No owner and no admin function. The factory never holds tokens: the whole supply is minted to the caller.
/// Issuing a token does not list it for trading; a market for a pair is a separate step.
contract TokenFactory {
    /// @dev 1e9 whole tokens at 18 decimals. Keeps balances far from the overflow range that issue 003 describes.
    uint256 public constant MAX_SUPPLY = 1e27;

    address[] private _tokens;
    mapping(address token => bool) private _isFactoryToken;

    event TokenCreated(
        address indexed token, address indexed creator, string name, string symbol, uint256 initialSupply
    );

    error EmptyName();
    error EmptySymbol();
    error ZeroSupply();
    error SupplyTooLarge();

    function createToken(string calldata name, string calldata symbol, uint256 initialSupply)
        external
        returns (address token)
    {
        if (bytes(name).length == 0) revert EmptyName();
        if (bytes(symbol).length == 0) revert EmptySymbol();
        if (initialSupply == 0) revert ZeroSupply();
        if (initialSupply > MAX_SUPPLY) revert SupplyTooLarge();

        token = address(new DemoToken(name, symbol, initialSupply, msg.sender));
        _tokens.push(token);
        _isFactoryToken[token] = true;

        emit TokenCreated(token, msg.sender, name, symbol, initialSupply);
    }

    function tokenCount() external view returns (uint256) {
        return _tokens.length;
    }

    function isFactoryToken(address token) external view returns (bool) {
        return _isFactoryToken[token];
    }

    /// @dev Oldest first. Returns at most `limit` entries, fewer near the end, and an empty array when
    /// `offset >= tokenCount()`. Never reverts, and the loop is bounded by the number of entries returned.
    function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = _tokens.length;
        if (offset >= total) return new address[](0);

        uint256 remaining = total - offset;
        uint256 count = limit < remaining ? limit : remaining;

        page = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = _tokens[offset + i];
        }
    }
}
