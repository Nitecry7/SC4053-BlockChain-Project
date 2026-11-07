// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockERC20} from "./MockERC20.sol";

/// @dev Malicious test token: once armed, it calls the target during a chosen balance change. By default it bubbles
/// any revert. In swallow mode it records the failure and lets the transfer continue, as a real attacker could.
contract ReentrantERC20 is MockERC20 {
    address private _target;
    bytes private _payload;
    uint256 private _skip;
    bool private _swallow;

    bool public fired;
    bool public innerCallFailed;
    bytes public innerRevertData;
    address public firedTo;
    uint256 public firedValue;

    constructor(string memory name_, string memory symbol_) MockERC20(name_, symbol_, 18) {}

    function arm(address target, bytes calldata payload) external {
        arm(target, payload, 0, false);
    }

    /// @param skip Balance changes to let through before firing, so that the next one after them fires.
    function arm(address target, bytes calldata payload, uint256 skip, bool swallow) public {
        _target = target;
        _payload = payload;
        _skip = skip;
        _swallow = swallow;
    }

    /// @dev Lets the token act as a trader, so that re-entry passes the book's owner check.
    function execute(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory returned) = target.call(data);
        if (!ok) _bubble(returned);
        return returned;
    }

    function _update(address from, address to, uint256 value) internal override {
        address target = _target;
        if (target != address(0)) {
            if (_skip != 0) {
                _skip--;
            } else {
                _target = address(0);
                fired = true;
                firedTo = to;
                firedValue = value;
                (bool ok, bytes memory returned) = target.call(_payload);
                if (!ok) {
                    if (!_swallow) _bubble(returned);
                    innerCallFailed = true;
                    innerRevertData = returned;
                }
            }
        }
        super._update(from, to, value);
    }

    function _bubble(bytes memory returned) private pure {
        assembly ("memory-safe") {
            revert(add(returned, 0x20), mload(returned))
        }
    }
}
