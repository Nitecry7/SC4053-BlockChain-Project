// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockERC20} from "./MockERC20.sol";

/// @dev Malicious test token: once armed, it calls the target during its next balance change and bubbles any revert.
contract ReentrantERC20 is MockERC20 {
    address private _target;
    bytes private _payload;

    constructor(string memory name_, string memory symbol_) MockERC20(name_, symbol_, 18) {}

    function arm(address target, bytes calldata payload) external {
        _target = target;
        _payload = payload;
    }

    function _update(address from, address to, uint256 value) internal override {
        address target = _target;
        if (target != address(0)) {
            _target = address(0);
            (bool ok, bytes memory returned) = target.call(_payload);
            if (!ok) {
                assembly ("memory-safe") {
                    revert(add(returned, 0x20), mload(returned))
                }
            }
        }
        super._update(from, to, value);
    }
}
