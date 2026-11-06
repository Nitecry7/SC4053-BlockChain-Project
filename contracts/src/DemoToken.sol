// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Plain ERC20 with a fixed supply minted once to `holder`. 18 decimals, as the OrderBook requires.
/// @dev No owner, no mint or burn function, no hooks, no fees. After construction the supply can never change.
contract DemoToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 initialSupply, address holder)
        ERC20(name_, symbol_)
    {
        _mint(holder, initialSupply);
    }
}
