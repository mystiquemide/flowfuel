// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FlowFuelRefuelVault, IOrbioExchange } from "../src/FlowFuelRefuelVault.sol";

interface Vm {
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
    function expectRevert() external;
    function expectRevert(bytes4 revertData) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData)
        external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool condition) internal pure {
        require(condition, "assertTrue failed");
    }

    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "uint256 values differ");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "address values differ");
    }

    function assertEq(bytes32 left, bytes32 right) internal pure {
        require(left == right, "bytes32 values differ");
    }
}

contract MockUsdG is IERC20 {
    string public constant name = "Mock USDG";
    string public constant symbol = "mUSDG";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
        totalSupply += amount;
        emit Transfer(address(0), account, amount);
    }

    function approve(address spender, uint256 amount) public virtual returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        uint256 approved = allowance[from][msg.sender];
        require(approved >= amount, "allowance");
        allowance[from][msg.sender] = approved - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract ReentrantUsdG is MockUsdG {
    address public target;
    bool public attack;

    function arm(address vault) external {
        target = vault;
        attack = true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (attack) {
            attack = false;
            (bool ok,) = target.call(abi.encodeWithSignature("withdraw(uint256)", 1));
            require(ok, "reentrant call unexpectedly succeeded");
        }
        return super.transfer(to, amount);
    }
}

contract MockExchange is IOrbioExchange {
    MockUsdG public immutable token;
    uint256 public maxFills = 64;
    Quote public quote =
        Quote({ creditOut: 1_400_000, usdgSpent: 1_000_000, feeAtoms: 20_000, fills: 1, reason: 0 });
    bool public revertOnBuy;
    bool public consumeFullInput;
    bytes32 public lastBeneficiary;
    uint256 public lastMinCreditOut;
    uint256 public lastAllowance;

    constructor(MockUsdG usdg) {
        token = usdg;
    }

    function setQuote(Quote calldata nextQuote) external {
        quote = nextQuote;
    }

    function setMaxFills(uint256 nextMaxFills) external {
        maxFills = nextMaxFills;
    }

    function setRevertOnBuy(bool value) external {
        revertOnBuy = value;
    }

    function setConsumeFullInput(bool value) external {
        consumeFullInput = value;
    }

    function getQuote(uint256, uint256 requestedMaxFills) external view returns (Quote memory) {
        require(requestedMaxFills <= maxFills && maxFills > 0, "max fills");
        return quote;
    }

    function MAX_FILLS() external view returns (uint256) {
        return maxFills;
    }

    function buyAndActivate(
        uint256 usdgIn,
        uint256 minCreditOut,
        bytes32 beneficiary,
        uint256 requestedMaxFills
    ) external returns (uint256 creditOut, uint256 usdgSpent, uint256 activationId) {
        require(!revertOnBuy, "exchange reverted");
        require(requestedMaxFills <= maxFills && maxFills > 0, "max fills");
        require(quote.creditOut >= minCreditOut, "slippage");
        require(quote.usdgSpent <= usdgIn, "spend");
        lastBeneficiary = beneficiary;
        lastMinCreditOut = minCreditOut;
        lastAllowance = token.allowance(msg.sender, address(this));
        token.transferFrom(msg.sender, address(this), consumeFullInput ? usdgIn : quote.usdgSpent);
        return (quote.creditOut, quote.usdgSpent, 77);
    }
}

contract FlowFuelRefuelVaultTest is TestBase {
    address internal constant CLIENT_A = address(0xA11CE);
    address internal constant CLIENT_B = address(0xB0B);
    address internal constant EXECUTOR = address(0xE1);
    address internal constant OTHER = address(0xE2);

    uint256 internal constant ONE_USDG = 1_000_000;

    MockUsdG internal token;
    MockExchange internal exchange;
    FlowFuelRefuelVault internal vault;

    event Deposited(address indexed client, uint256 amount);
    event Withdrawn(address indexed client, uint256 amount);

    function setUp() public {
        token = new MockUsdG();
        exchange = new MockExchange(token);
        vault = new FlowFuelRefuelVault(address(token), address(exchange));
        token.mint(CLIENT_A, 10 * ONE_USDG);
        token.mint(CLIENT_B, 10 * ONE_USDG);
    }

    function depositAs(address client, uint256 amount) internal {
        vm.startPrank(client);
        token.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function configureAs(
        address client,
        address executor,
        uint256 refill,
        uint256 cap,
        uint16 slippage
    ) internal {
        vm.prank(client);
        vault.setPolicy(executor, refill, cap, slippage);
    }

    function testDepositCreditsOnlyTheCallingClientAndEmits() public {
        vm.startPrank(CLIENT_A);
        token.approve(address(vault), 2 * ONE_USDG);
        vm.expectEmit(true, false, false, true);
        emit Deposited(CLIENT_A, 2 * ONE_USDG);
        vault.deposit(2 * ONE_USDG);
        vm.stopPrank();

        assertEq(vault.reserves(CLIENT_A), 2 * ONE_USDG);
        assertEq(vault.reserves(CLIENT_B), 0);
        assertEq(token.balanceOf(address(vault)), 2 * ONE_USDG);
    }

    function testPartialAndFullWithdrawalAreClientOwned() public {
        depositAs(CLIENT_A, 3 * ONE_USDG);

        vm.prank(CLIENT_A);
        vm.expectEmit(true, false, false, true);
        emit Withdrawn(CLIENT_A, ONE_USDG);
        vault.withdraw(ONE_USDG);
        assertEq(vault.reserves(CLIENT_A), 2 * ONE_USDG);

        uint256 remaining = vault.reserves(CLIENT_A);
        vm.prank(CLIENT_A);
        vault.withdraw(remaining);
        assertEq(vault.reserves(CLIENT_A), 0);
        assertEq(token.balanceOf(CLIENT_A), 10 * ONE_USDG);
    }

    function testCannotWithdrawAnotherClientsReserveOrAboveReserve() public {
        depositAs(CLIENT_A, 2 * ONE_USDG);
        depositAs(CLIENT_B, 2 * ONE_USDG);

        vm.prank(CLIENT_B);
        vm.expectRevert(FlowFuelRefuelVault.InsufficientReserve.selector);
        vault.withdraw(3 * ONE_USDG);

        assertEq(vault.reserves(CLIENT_A), 2 * ONE_USDG);
        assertEq(vault.reserves(CLIENT_B), 2 * ONE_USDG);
    }

    function testPolicyCanBeSetDisabledAndCannotUseInvalidLimits() public {
        vm.prank(CLIENT_A);
        vm.expectRevert(FlowFuelRefuelVault.InvalidPolicy.selector);
        vault.setPolicy(address(0), ONE_USDG, ONE_USDG, 200);

        vm.prank(CLIENT_A);
        vm.expectRevert(FlowFuelRefuelVault.InvalidPolicy.selector);
        vault.setPolicy(EXECUTOR, 0, ONE_USDG, 200);

        vm.prank(CLIENT_A);
        vm.expectRevert(FlowFuelRefuelVault.InvalidPolicy.selector);
        vault.setPolicy(EXECUTOR, 2 * ONE_USDG, ONE_USDG, 200);

        vm.prank(CLIENT_A);
        vm.expectRevert(FlowFuelRefuelVault.InvalidPolicy.selector);
        vault.setPolicy(EXECUTOR, ONE_USDG, ONE_USDG, 1_001);

        configureAs(CLIENT_A, EXECUTOR, ONE_USDG, 3 * ONE_USDG, 200);
        (bool enabled, address executor,,, uint16 maxSlippageBps) = vault.policies(CLIENT_A);
        assertTrue(enabled);
        assertEq(executor, EXECUTOR);
        assertEq(maxSlippageBps, 200);

        vm.prank(OTHER);
        vault.disablePolicy();
        (enabled,,,,) = vault.policies(CLIENT_A);
        assertTrue(enabled);

        vm.prank(CLIENT_A);
        vault.disablePolicy();
        (enabled,,,,) = vault.policies(CLIENT_A);
        assertTrue(!enabled);
    }

    function testOnlyConfiguredExecutorCanRefuelAndBeneficiaryIsClient() public {
        depositAs(CLIENT_A, 2 * ONE_USDG);
        configureAs(CLIENT_A, EXECUTOR, ONE_USDG, 3 * ONE_USDG, 200);

        vm.prank(OTHER);
        vm.expectRevert(FlowFuelRefuelVault.UnauthorizedExecutor.selector);
        vault.refuel(CLIENT_A);

        vm.prank(EXECUTOR);
        (uint256 creditOut, uint256 usdgSpent, uint256 activationId) = vault.refuel(CLIENT_A);
        assertEq(creditOut, 1_400_000);
        assertEq(usdgSpent, ONE_USDG);
        assertEq(activationId, 77);
        assertEq(exchange.lastBeneficiary(), bytes32(uint256(uint160(CLIENT_A))));
        assertEq(vault.reserves(CLIENT_A), ONE_USDG);
        assertEq(token.allowance(address(vault), address(exchange)), 0);
    }

    function testClientARefuelCannotConsumeClientBReserve() public {
        depositAs(CLIENT_A, 2 * ONE_USDG);
        depositAs(CLIENT_B, 2 * ONE_USDG);
        configureAs(CLIENT_A, EXECUTOR, ONE_USDG, 3 * ONE_USDG, 200);
        configureAs(CLIENT_B, EXECUTOR, ONE_USDG, 3 * ONE_USDG, 200);

        vm.prank(EXECUTOR);
        vault.refuel(CLIENT_A);

        assertEq(vault.reserves(CLIENT_A), ONE_USDG);
        assertEq(vault.reserves(CLIENT_B), 2 * ONE_USDG);
    }

    function testWeeklyCapAccumulatesAndResetsByEpoch() public {
        depositAs(CLIENT_A, 5 * ONE_USDG);
        configureAs(CLIENT_A, EXECUTOR, ONE_USDG, 2 * ONE_USDG, 200);

        vm.startPrank(EXECUTOR);
        vault.refuel(CLIENT_A);
        vault.refuel(CLIENT_A);
        vm.expectRevert(FlowFuelRefuelVault.WeeklyCapExceeded.selector);
        vault.refuel(CLIENT_A);
        vm.stopPrank();

        (, uint256 spent) = vault.currentWeeklyUsage(CLIENT_A);
        assertEq(spent, 2 * ONE_USDG);

        vm.warp(2 weeks + 1);
        vm.prank(EXECUTOR);
        vault.refuel(CLIENT_A);
        (, spent) = vault.currentWeeklyUsage(CLIENT_A);
        assertEq(spent, ONE_USDG);
    }

    function testInsufficientReserveIsRejectedBeforeExchange() public {
        depositAs(CLIENT_A, ONE_USDG);
        configureAs(CLIENT_A, EXECUTOR, 2 * ONE_USDG, 3 * ONE_USDG, 200);

        vm.prank(EXECUTOR);
        vm.expectRevert(FlowFuelRefuelVault.InsufficientReserve.selector);
        vault.refuel(CLIENT_A);
        assertEq(vault.reserves(CLIENT_A), ONE_USDG);
        assertEq(exchange.lastBeneficiary(), bytes32(0));
    }

    function testZeroOutputQuoteIsRejected() public {
        depositAs(CLIENT_A, 2 * ONE_USDG);
        configureAs(CLIENT_A, EXECUTOR, ONE_USDG, 3 * ONE_USDG, 200);
        exchange.setQuote(
            IOrbioExchange.Quote({
                creditOut: 0,
                usdgSpent: ONE_USDG,
                feeAtoms: 0,
                fills: 1,
                reason: 0
            })
        );

        vm.prank(EXECUTOR);
        vm.expectRevert(FlowFuelRefuelVault.QuoteUnavailable.selector);
        vault.refuel(CLIENT_A);
        assertEq(vault.reserves(CLIENT_A), 2 * ONE_USDG);
    }

    function testSlippageFloorUsesConfiguredBps() public {
        depositAs(CLIENT_A, 2 * ONE_USDG);
        configureAs(CLIENT_A, EXECUTOR, ONE_USDG, 3 * ONE_USDG, 200);

        vm.prank(EXECUTOR);
        vault.refuel(CLIENT_A);
        assertEq(exchange.lastMinCreditOut(), 1_372_000);
        assertEq(exchange.lastAllowance(), ONE_USDG);
    }

    function testReserveAccountingUsesActualTokenOutflow() public {
        depositAs(CLIENT_A, 2 * ONE_USDG);
        configureAs(CLIENT_A, EXECUTOR, ONE_USDG, 3 * ONE_USDG, 200);
        exchange.setQuote(
            IOrbioExchange.Quote({
                creditOut: 1_270_873,
                usdgSpent: 980_294,
                feeAtoms: 19_606,
                fills: 2,
                reason: 0
            })
        );
        exchange.setConsumeFullInput(true);

        vm.prank(EXECUTOR);
        (, uint256 usdgSpent,) = vault.refuel(CLIENT_A);

        assertEq(usdgSpent, ONE_USDG);
        assertEq(vault.reserves(CLIENT_A), ONE_USDG);
        assertEq(token.balanceOf(address(vault)), ONE_USDG);
        (, uint256 weekSpent) = vault.currentWeeklyUsage(CLIENT_A);
        assertEq(weekSpent, ONE_USDG);
    }

    function testExchangeRevertDoesNotConsumeReserveOrAllowance() public {
        depositAs(CLIENT_A, 2 * ONE_USDG);
        configureAs(CLIENT_A, EXECUTOR, ONE_USDG, 3 * ONE_USDG, 200);
        exchange.setRevertOnBuy(true);

        vm.prank(EXECUTOR);
        vm.expectRevert();
        vault.refuel(CLIENT_A);

        assertEq(vault.reserves(CLIENT_A), 2 * ONE_USDG);
        (, uint256 spent) = vault.currentWeeklyUsage(CLIENT_A);
        assertEq(spent, 0);
        assertEq(token.allowance(address(vault), address(exchange)), 0);
    }

    function testWithdrawalIsReentrancyProtected() public {
        ReentrantUsdG reentrantToken = new ReentrantUsdG();
        FlowFuelRefuelVault reentrantVault =
            new FlowFuelRefuelVault(address(reentrantToken), address(exchange));
        reentrantToken.mint(CLIENT_A, 2 * ONE_USDG);
        vm.startPrank(CLIENT_A);
        reentrantToken.approve(address(reentrantVault), 2 * ONE_USDG);
        reentrantVault.deposit(2 * ONE_USDG);
        vm.stopPrank();

        reentrantToken.arm(address(reentrantVault));
        vm.prank(CLIENT_A);
        vm.expectRevert();
        reentrantVault.withdraw(ONE_USDG);
        assertEq(reentrantVault.reserves(CLIENT_A), 2 * ONE_USDG);
    }
}
