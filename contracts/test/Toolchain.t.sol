// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Phase 0 smoke test: proves solc 0.8.24, forge-std and the OpenZeppelin remapping work.
/// Delete in Phase 1 once OrderBookBase.t.sol exists.
contract ToolchainToken is ERC20 {
    constructor() ERC20("Toolchain", "TC") {
        _mint(msg.sender, 1e18);
    }
}

contract ToolchainVault is ReentrancyGuard {
    using SafeERC20 for ERC20;

    function pull(ERC20 token, uint256 amount) external nonReentrant {
        token.safeTransferFrom(msg.sender, address(this), amount);
    }
}

contract ToolchainTest is Test {
    function test_OpenZeppelinRemappingAndSafeTransfer() public {
        ToolchainToken token = new ToolchainToken();
        ToolchainVault vault = new ToolchainVault();
        token.approve(address(vault), 1e18);
        vault.pull(token, 1e18);
        assertEq(token.balanceOf(address(vault)), 1e18);
        assertEq(token.decimals(), 18);
    }
}
