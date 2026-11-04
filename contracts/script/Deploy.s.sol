// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {OrderBook} from "../src/OrderBook.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {TokenFactory} from "../src/TokenFactory.sol";

/// @notice Local-Anvil deployment: TokenFactory, MarketFactory, the NTU and SGDx demo tokens, the NTU/SGDx market, and
/// demo balances for development wallets. See docs/DEPLOYMENT.md for the commands.
/// @dev Local only: `run()` reverts unless both Forge's chain id and the node's own `eth_chainId` are 31337. (Forge's
/// `--chain` flag alone can make `block.chainid` say 31337 on any node, so the node is asked directly too.) No private
/// key is read or needed. Broadcast with
/// `--unlocked --sender $DEPLOYER` so Anvil signs for its own unlocked account. `msg.sender` and `address(this)` are
/// never read, because inside a script they are the script caller and the ephemeral script, not the broadcaster.
/// The deployer is passed explicitly instead.
contract Deploy is Script {
    uint256 internal constant LOCAL_CHAIN_ID = 31337;
    uint256 internal constant TOKEN_SUPPLY = 1_000_000e18;
    uint256 internal constant DEMO_AMOUNT = 10_000e18;

    /// @dev Anvil's well-known default accounts 0 to 3. These are public addresses, not secrets.
    address internal constant ANVIL_ACCOUNT_0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address internal constant ANVIL_ACCOUNT_1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address internal constant ANVIL_ACCOUNT_2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address internal constant ANVIL_ACCOUNT_3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    struct Deployment {
        address tokenFactory;
        address marketFactory;
        address ntu; // base token
        address sgdx; // quote token
        address market; // OrderBook(ntu, sgdx), created through the MarketFactory
    }

    error WrongChain(uint256 chainId);
    error InvalidWallet(address wallet);
    error CheckFailed(bytes32 check);

    /// @dev Env: `DEPLOYER` (public address, default Anvil account 0) and `DEMO_WALLETS` (comma-separated addresses,
    /// default Anvil accounts 1 to 3). Needs `--rpc-url`, because the node's chain id is read from it.
    function run() external returns (Deployment memory d) {
        if (block.chainid != LOCAL_CHAIN_ID) revert WrongChain(block.chainid);
        uint256 nodeChainId = _liveChainId();
        if (nodeChainId != LOCAL_CHAIN_ID) revert WrongChain(nodeChainId);

        address deployer = vm.envOr("DEPLOYER", ANVIL_ACCOUNT_0);
        address[] memory wallets = vm.envOr("DEMO_WALLETS", ",", defaultWallets());

        vm.startBroadcast(deployer);
        d = deploy(deployer, wallets);
        vm.stopBroadcast();

        console2.log("deployer       ", deployer);
        console2.log("TokenFactory   ", d.tokenFactory);
        console2.log("MarketFactory  ", d.marketFactory);
        console2.log("NTU (base)     ", d.ntu);
        console2.log("SGDx (quote)   ", d.sgdx);
        console2.log("NTU/SGDx market", d.market);
    }

    /// @dev The chain id the RPC node itself reports. Virtual so that an in-process test, which has no RPC node, can
    /// stand in for it.
    function _liveChainId() internal virtual returns (uint256 id) {
        bytes memory raw = vm.rpc("eth_chainId", "[]");
        if (raw.length == 0 || raw.length > 32) revert CheckFailed("rpc-chain-id");
        for (uint256 i = 0; i < raw.length; i++) {
            id = (id << 8) | uint8(raw[i]);
        }
    }

    function defaultWallets() public pure returns (address[] memory wallets) {
        wallets = new address[](3);
        wallets[0] = ANVIL_ACCOUNT_1;
        wallets[1] = ANVIL_ACCOUNT_2;
        wallets[2] = ANVIL_ACCOUNT_3;
    }

    /// @param holder The account that issues the tokens, which is whoever calls the factories: the broadcast deployer
    /// in `run()`, or the script contract itself when a test calls this directly. A wrong value fails the post-checks.
    /// @param wallets Development wallets that each receive DEMO_AMOUNT of both tokens.
    function deploy(address holder, address[] memory wallets) public returns (Deployment memory d) {
        _validateWallets(holder, wallets);

        TokenFactory tokenFactory = new TokenFactory();
        MarketFactory marketFactory = new MarketFactory();

        address ntu = tokenFactory.createToken("NTU Token", "NTU", TOKEN_SUPPLY);
        address sgdx = tokenFactory.createToken("Singapore Dollar X", "SGDx", TOKEN_SUPPLY);
        address market = marketFactory.createMarket(ntu, sgdx);

        for (uint256 i = 0; i < wallets.length; i++) {
            if (!IERC20(ntu).transfer(wallets[i], DEMO_AMOUNT)) revert CheckFailed("ntu-transfer");
            if (!IERC20(sgdx).transfer(wallets[i], DEMO_AMOUNT)) revert CheckFailed("sgdx-transfer");
        }

        d = Deployment(address(tokenFactory), address(marketFactory), ntu, sgdx, market);
        _verify(d, holder, wallets);
    }

    /// @dev Zero address, the holder itself, or a repeat would break the balance accounting.
    function _validateWallets(address holder, address[] memory wallets) internal pure {
        for (uint256 i = 0; i < wallets.length; i++) {
            if (wallets[i] == address(0) || wallets[i] == holder) revert InvalidWallet(wallets[i]);
            for (uint256 j = 0; j < i; j++) {
                if (wallets[j] == wallets[i]) revert InvalidWallet(wallets[i]);
            }
        }
    }

    /// @dev These checks run against the state this script just built. Under `forge script --broadcast` that is the
    /// simulation, so confirm the live chain separately (docs/DEPLOYMENT.md and the exporter do).
    function _verify(Deployment memory d, address holder, address[] memory wallets) internal view {
        TokenFactory tokenFactory = TokenFactory(d.tokenFactory);
        MarketFactory marketFactory = MarketFactory(d.marketFactory);

        if (tokenFactory.tokenCount() != 2) revert CheckFailed("token-count");
        address[] memory tokens = tokenFactory.getTokens(0, 2);
        if (tokens[0] != d.ntu || tokens[1] != d.sgdx) revert CheckFailed("token-registry");
        if (!tokenFactory.isFactoryToken(d.ntu) || !tokenFactory.isFactoryToken(d.sgdx)) {
            revert CheckFailed("is-factory-token");
        }

        _verifyToken(d.ntu, "NTU", holder, wallets);
        _verifyToken(d.sgdx, "SGDx", holder, wallets);

        if (marketFactory.marketCount() != 1) revert CheckFailed("market-count");
        if (marketFactory.getMarket(d.ntu, d.sgdx) != d.market) revert CheckFailed("market-lookup");
        if (marketFactory.getMarket(d.sgdx, d.ntu) != d.market) revert CheckFailed("market-lookup-reversed");
        if (!marketFactory.isMarket(d.market)) revert CheckFailed("is-market");
        if (OrderBook(d.market).baseToken() != d.ntu) revert CheckFailed("market-base");
        if (OrderBook(d.market).quoteToken() != d.sgdx) revert CheckFailed("market-quote");
    }

    function _verifyToken(address token, string memory symbol, address holder, address[] memory wallets) internal view {
        IERC20Metadata t = IERC20Metadata(token);
        if (t.decimals() != 18) revert CheckFailed("decimals");
        if (keccak256(bytes(t.symbol())) != keccak256(bytes(symbol))) revert CheckFailed("symbol");
        if (t.totalSupply() != TOKEN_SUPPLY) revert CheckFailed("total-supply");
        if (t.balanceOf(holder) != TOKEN_SUPPLY - wallets.length * DEMO_AMOUNT) revert CheckFailed("holder-balance");
        for (uint256 i = 0; i < wallets.length; i++) {
            if (t.balanceOf(wallets[i]) != DEMO_AMOUNT) revert CheckFailed("wallet-balance");
        }
    }
}
