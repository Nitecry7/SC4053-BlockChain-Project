// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {OrderBook} from "../src/OrderBook.sol";
import {IOrderBook} from "../src/interfaces/IOrderBook.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {TokenFactory} from "../src/TokenFactory.sol";

/// @dev Runs the deployment script in-process. The script contract is the issuer here, so it is passed as `holder`.
/// This checks the script's logic. It is not a deployment to a real chain: see docs/DEPLOYMENT.md for that.
/// @dev Stands in for the RPC node's chain id, which an in-process test cannot query.
contract DeployWithNodeChainId is Deploy {
    uint256 internal nodeChainId = 31337;

    function setNodeChainId(uint256 id) external {
        nodeChainId = id;
    }

    function _liveChainId() internal view override returns (uint256) {
        return nodeChainId;
    }
}

contract DeployTest is Test {
    uint256 internal constant EIP170_LIMIT = 24_576;
    uint256 internal constant EIP3860_INITCODE_LIMIT = 49_152;
    uint256 internal constant SUPPLY = 1_000_000e18;
    uint256 internal constant DEMO = 10_000e18;

    Deploy internal script;
    Deploy.Deployment internal d;
    address[] internal wallets;

    function setUp() public {
        script = new Deploy();
        wallets = script.defaultWallets();
        d = script.deploy(address(script), wallets);
    }

    function test_deploy_addressesAreNonZeroAndDistinct() public view {
        address[5] memory all = [d.tokenFactory, d.marketFactory, d.ntu, d.sgdx, d.market];
        for (uint256 i = 0; i < all.length; i++) {
            assertGt(all[i].code.length, 0, "no code at address");
            for (uint256 j = 0; j < i; j++) {
                assertTrue(all[i] != all[j], "duplicate address");
            }
        }
    }

    function test_deploy_tokensHaveExpectedMetadataAndSupply() public view {
        IERC20Metadata ntu = IERC20Metadata(d.ntu);
        IERC20Metadata sgdx = IERC20Metadata(d.sgdx);

        assertEq(ntu.name(), "NTU Token");
        assertEq(ntu.symbol(), "NTU");
        assertEq(ntu.decimals(), 18);
        assertEq(ntu.totalSupply(), SUPPLY);
        assertEq(sgdx.name(), "Singapore Dollar X");
        assertEq(sgdx.symbol(), "SGDx");
        assertEq(sgdx.decimals(), 18);
        assertEq(sgdx.totalSupply(), SUPPLY);
    }

    function test_deploy_balancesAreHolderRemainderAndDemoAmounts() public view {
        for (uint256 i = 0; i < wallets.length; i++) {
            assertEq(IERC20Metadata(d.ntu).balanceOf(wallets[i]), DEMO);
            assertEq(IERC20Metadata(d.sgdx).balanceOf(wallets[i]), DEMO);
        }
        uint256 remainder = SUPPLY - wallets.length * DEMO;
        assertEq(IERC20Metadata(d.ntu).balanceOf(address(script)), remainder);
        assertEq(IERC20Metadata(d.sgdx).balanceOf(address(script)), remainder);
        // The factories and the market hold nothing.
        assertEq(IERC20Metadata(d.ntu).balanceOf(d.market) + IERC20Metadata(d.sgdx).balanceOf(d.market), 0);
        assertEq(IERC20Metadata(d.ntu).balanceOf(d.tokenFactory), 0);
        assertEq(IERC20Metadata(d.ntu).balanceOf(d.marketFactory), 0);
    }

    function test_deploy_tokensAreInTheTokenFactoryRegistry() public view {
        TokenFactory tf = TokenFactory(d.tokenFactory);
        assertEq(tf.tokenCount(), 2);
        assertTrue(tf.isFactoryToken(d.ntu));
        assertTrue(tf.isFactoryToken(d.sgdx));
        address[] memory registered = tf.getTokens(0, 10);
        assertEq(registered[0], d.ntu);
        assertEq(registered[1], d.sgdx);
    }

    function test_deploy_marketIsRegisteredInBothOrientations() public view {
        MarketFactory mf = MarketFactory(d.marketFactory);
        assertEq(mf.marketCount(), 1);
        assertEq(mf.getMarket(d.ntu, d.sgdx), d.market);
        assertEq(mf.getMarket(d.sgdx, d.ntu), d.market);
        assertTrue(mf.isMarket(d.market));
        assertEq(mf.getMarkets(0, 10)[0], d.market);
    }

    function test_deploy_marketReferencesIntendedTokensAndSpecConstants() public view {
        OrderBook market = OrderBook(d.market);
        assertEq(market.baseToken(), d.ntu);
        assertEq(market.quoteToken(), d.sgdx);
        assertEq(market.PRICE_SCALE(), 1e18);
        assertEq(market.LOT_SIZE(), 1e9);
        assertEq(market.TICK_SIZE(), 1e9);
    }

    /// @dev Approval and trade on the deployed market, SPEC section 3: wallet 0 sells 10 NTU at 2.0, wallet 1 buys 4 at
    /// limit 2.2 (escrow 8.8), fill 4 at the maker price 2.0, refund 0.8, the book keeps 6 NTU and 0 SGDx.
    function test_deploy_tradeOnTheDeployedMarket() public {
        IOrderBook market = IOrderBook(d.market);
        IERC20Metadata ntu = IERC20Metadata(d.ntu);
        IERC20Metadata sgdx = IERC20Metadata(d.sgdx);
        address seller = wallets[0];
        address buyer = wallets[1];

        vm.startPrank(seller);
        ntu.approve(d.market, 10e18);
        market.placeLimitOrder(IOrderBook.Side.Sell, 2e18, 10e18);
        vm.stopPrank();

        vm.startPrank(buyer);
        sgdx.approve(d.market, market.requiredQuote(4e18, 2.2e18));
        market.placeLimitOrder(IOrderBook.Side.Buy, 2.2e18, 4e18);
        vm.stopPrank();

        assertEq(ntu.balanceOf(seller), DEMO - 10e18);
        assertEq(sgdx.balanceOf(seller), DEMO + 8e18);
        assertEq(ntu.balanceOf(buyer), DEMO + 4e18);
        assertEq(sgdx.balanceOf(buyer), DEMO - 8e18);
        assertEq(ntu.balanceOf(d.market), 6e18);
        assertEq(sgdx.balanceOf(d.market), 0);
        assertEq(market.lastTradePrice(), 2e18);
    }

    function test_deploy_contractSizesAreWithinEvmLimits() public view {
        assertLe(d.tokenFactory.code.length, EIP170_LIMIT);
        assertLe(d.marketFactory.code.length, EIP170_LIMIT);
        assertLe(d.market.code.length, EIP170_LIMIT);
        // MarketFactory embeds OrderBook's creation code, so both initcodes are checked too (EIP-3860).
        assertLe(type(MarketFactory).creationCode.length, EIP3860_INITCODE_LIMIT);
        assertLe(type(OrderBook).creationCode.length, EIP3860_INITCODE_LIMIT);
    }

    function test_defaultWallets_areAnvilAccountsOneToThree() public view {
        assertEq(wallets.length, 3);
        assertEq(wallets[0], 0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
        assertEq(wallets[1], 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC);
        assertEq(wallets[2], 0x90F79bf6EB2c4f870365E785982E1f101E93b906);
    }

    function test_deploy_customWalletListIsFunded() public {
        address[] memory custom = new address[](2);
        custom[0] = makeAddr("alice");
        custom[1] = makeAddr("bob");

        Deploy.Deployment memory other = script.deploy(address(script), custom);

        assertEq(IERC20Metadata(other.ntu).balanceOf(custom[0]), DEMO);
        assertEq(IERC20Metadata(other.sgdx).balanceOf(custom[1]), DEMO);
        assertEq(IERC20Metadata(other.ntu).balanceOf(address(script)), SUPPLY - 2 * DEMO);
    }

    function test_deploy_emptyWalletListKeepsEverythingWithTheHolder() public {
        Deploy.Deployment memory other = script.deploy(address(script), new address[](0));
        assertEq(IERC20Metadata(other.ntu).balanceOf(address(script)), SUPPLY);
    }

    function test_deploy_rejectsZeroWalletHolderAsWalletAndDuplicateWallets() public {
        address[] memory bad = new address[](1);

        bad[0] = address(0);
        vm.expectRevert(abi.encodeWithSelector(Deploy.InvalidWallet.selector, address(0)));
        script.deploy(address(script), bad);

        bad[0] = address(script); // the holder cannot be its own demo wallet
        vm.expectRevert(abi.encodeWithSelector(Deploy.InvalidWallet.selector, address(script)));
        script.deploy(address(script), bad);

        address[] memory twice = new address[](2);
        twice[0] = makeAddr("alice");
        twice[1] = makeAddr("alice");
        vm.expectRevert(abi.encodeWithSelector(Deploy.InvalidWallet.selector, twice[1]));
        script.deploy(address(script), twice);
    }

    /// @dev The token factory mints to whoever calls it. If the stated holder is not that caller, a post-check fails
    /// instead of the deployment silently reporting the wrong funding.
    function test_deploy_wrongHolderFailsAPostCheck() public {
        address notTheCaller = makeAddr("notTheCaller");
        vm.expectRevert(abi.encodeWithSelector(Deploy.CheckFailed.selector, bytes32("holder-balance")));
        script.deploy(notTheCaller, wallets);
    }

    /// @dev The broadcast path with the default environment: `run()` broadcasts from the explicit deployer and passes it
    /// as the holder. If it broadcast from another account, the holder post-check would fail. Custom `DEPLOYER` and
    /// `DEMO_WALLETS` values are checked on a real chain instead (docs/ai-audit/test-evidence/person2/p2-3-deployment.md),
    /// because environment variables are process-wide and would leak into other tests.
    function test_run_broadcastsFromTheDeployerAndFundsDefaultWallets() public {
        DeployWithNodeChainId runner = new DeployWithNodeChainId();
        Deploy.Deployment memory r = runner.run();

        address deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        assertEq(IERC20Metadata(r.ntu).balanceOf(deployer), SUPPLY - 3 * DEMO);
        assertEq(IERC20Metadata(r.sgdx).balanceOf(deployer), SUPPLY - 3 * DEMO);
        address[] memory defaults = runner.defaultWallets();
        for (uint256 i = 0; i < defaults.length; i++) {
            assertEq(IERC20Metadata(r.ntu).balanceOf(defaults[i]), DEMO);
        }
        assertEq(MarketFactory(r.marketFactory).getMarket(r.ntu, r.sgdx), r.market);
    }

    /// @dev The reviewer's bypass: Forge's `--chain 31337` makes `block.chainid` say 31337 on any node. The node's own
    /// answer is checked too, so a node that reports another chain id is refused.
    function test_run_revertsWhenTheNodeReportsAnotherChainEvenIfBlockChainidSaysLocal() public {
        DeployWithNodeChainId runner = new DeployWithNodeChainId();
        runner.setNodeChainId(1);
        assertEq(block.chainid, 31337, "forge says local");

        vm.expectRevert(abi.encodeWithSelector(Deploy.WrongChain.selector, 1));
        runner.run();
    }

    function test_run_revertsOffTheLocalChain() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(Deploy.WrongChain.selector, 1));
        script.run();

        vm.chainId(11155111); // a public testnet
        vm.expectRevert(abi.encodeWithSelector(Deploy.WrongChain.selector, 11155111));
        script.run();
    }
}
