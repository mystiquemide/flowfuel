// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IOrbioExchange {
    struct Quote {
        uint256 creditOut;
        uint256 usdgSpent;
        uint256 feeAtoms;
        uint256 fills;
        uint8 reason;
    }

    function getQuote(uint256 usdgIn, uint256 maxFills) external view returns (Quote memory);

    function buyAndActivate(
        uint256 usdgIn,
        uint256 minCreditOut,
        bytes32 beneficiary,
        uint256 maxFills
    ) external returns (uint256 creditOut, uint256 usdgSpent, uint256 activationId);

    function MAX_FILLS() external view returns (uint256);
}

/**
 * @title FlowFuelRefuelVault
 * @notice A single-purpose, non-upgradeable USDG reserve for client-owned
 *         Orbio inference refueling.
 *
 * The Orbio balance threshold is intentionally not enforced here. FlowFuel
 * reads the live gateway balance and decides when to request a refill. This
 * contract enforces the financial boundary: client reserve ownership, the
 * explicitly authorized executor, the configured refill amount, the weekly
 * cap, quote-derived slippage, and a beneficiary derived from the client
 * address.
 */
contract FlowFuelRefuelVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant WEEK = 1 weeks;
    uint16 public constant MAX_SLIPPAGE_BPS = 1_000;

    IERC20 public immutable USDG;
    IOrbioExchange public immutable EXCHANGE;

    struct Policy {
        bool enabled;
        address executor;
        uint256 refillAmount;
        uint256 weeklyCap;
        uint16 maxSlippageBps;
    }

    mapping(address => uint256) public reserves;
    mapping(address => Policy) public policies;
    mapping(address => uint256) public weekEpoch;
    mapping(address => uint256) public weekSpent;

    error InvalidAddress();
    error InvalidAmount();
    error InvalidPolicy();
    error UnauthorizedExecutor();
    error PolicyDisabled();
    error InsufficientReserve();
    error WeeklyCapExceeded();
    error QuoteUnavailable();
    error InvalidExchangeSpend();

    event Deposited(address indexed client, uint256 amount);
    event Withdrawn(address indexed client, uint256 amount);
    event PolicyUpdated(
        address indexed client,
        bool enabled,
        address indexed executor,
        uint256 refillAmount,
        uint256 weeklyCap,
        uint16 maxSlippageBps
    );
    event Refueled(
        address indexed client,
        uint256 usdgSpent,
        uint256 creditOut,
        uint256 activationId,
        uint256 indexed week,
        uint256 weekSpentAfter,
        uint256 quoteCreditOut,
        uint256 quoteUsdgSpent,
        uint256 minCreditOut,
        uint256 quoteFeeAtoms,
        uint256 quoteFills,
        uint8 quoteReason
    );

    constructor(address usdg, address exchange) {
        if (usdg == address(0) || exchange == address(0)) revert InvalidAddress();
        USDG = IERC20(usdg);
        EXCHANGE = IOrbioExchange(exchange);
    }

    /**
     * @notice Deposits USDG into the caller's separately accounted reserve.
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = USDG.balanceOf(address(this));
        USDG.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = USDG.balanceOf(address(this)) - beforeBalance;
        if (received != amount) revert InvalidAmount();
        reserves[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraws unused USDG from the caller's own reserve.
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        uint256 reserve = reserves[msg.sender];
        if (amount > reserve) revert InsufficientReserve();
        reserves[msg.sender] = reserve - amount;
        USDG.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Enables or replaces the caller's onchain refuel policy.
     * @dev The threshold that causes FlowFuel to request this policy remains
     *      offchain because the vault has no oracle for the Orbio gateway.
     */
    function setPolicy(
        address executor,
        uint256 refillAmount,
        uint256 weeklyCap,
        uint16 maxSlippageBps
    ) external {
        if (
            executor == address(0) || refillAmount == 0 || weeklyCap < refillAmount
                || maxSlippageBps > MAX_SLIPPAGE_BPS
        ) revert InvalidPolicy();

        policies[msg.sender] = Policy({
            enabled: true,
            executor: executor,
            refillAmount: refillAmount,
            weeklyCap: weeklyCap,
            maxSlippageBps: maxSlippageBps
        });
        emit PolicyUpdated(msg.sender, true, executor, refillAmount, weeklyCap, maxSlippageBps);
    }

    /**
     * @notice Disables future refuels without touching the client's reserve.
     */
    function disablePolicy() external {
        Policy storage policy = policies[msg.sender];
        policy.enabled = false;
        emit PolicyUpdated(
            msg.sender,
            false,
            policy.executor,
            policy.refillAmount,
            policy.weeklyCap,
            policy.maxSlippageBps
        );
    }

    /**
     * @notice Returns effective usage for the current deterministic UTC week.
     */
    function currentWeeklyUsage(address client)
        external
        view
        returns (uint256 epoch, uint256 spent)
    {
        epoch = block.timestamp / WEEK;
        spent = weekEpoch[client] == epoch ? weekSpent[client] : 0;
    }

    /**
     * @notice Executes one bounded refuel for a client.
     * @dev The executor cannot provide a beneficiary. The only beneficiary
     *      passed to Orbio Exchange is the `client` argument encoded here.
     */
    function refuel(address client)
        external
        nonReentrant
        returns (uint256 creditOut, uint256 usdgSpent, uint256 activationId)
    {
        if (client == address(0)) revert InvalidAddress();
        Policy memory policy = policies[client];
        if (msg.sender != policy.executor) revert UnauthorizedExecutor();
        if (!policy.enabled) revert PolicyDisabled();
        if (policy.refillAmount == 0) revert InvalidPolicy();

        uint256 reserve = reserves[client];
        if (reserve < policy.refillAmount) revert InsufficientReserve();

        uint256 epoch = block.timestamp / WEEK;
        uint256 spent = weekEpoch[client] == epoch ? weekSpent[client] : 0;
        if (spent > policy.weeklyCap || policy.refillAmount > policy.weeklyCap - spent) {
            revert WeeklyCapExceeded();
        }

        uint256 maxFills = EXCHANGE.MAX_FILLS();
        if (maxFills == 0) revert QuoteUnavailable();
        IOrbioExchange.Quote memory quote = EXCHANGE.getQuote(policy.refillAmount, maxFills);
        if (quote.creditOut == 0 || quote.usdgSpent == 0 || quote.usdgSpent > policy.refillAmount) {
            revert QuoteUnavailable();
        }

        uint256 minCreditOut = quote.creditOut * (BPS - uint256(policy.maxSlippageBps)) / BPS;
        if (minCreditOut == 0) revert QuoteUnavailable();

        // Exact temporary allowance. There is no persistent exchange allowance.
        USDG.forceApprove(address(EXCHANGE), policy.refillAmount);
        (creditOut, usdgSpent, activationId) = EXCHANGE.buyAndActivate(
            policy.refillAmount, minCreditOut, bytes32(uint256(uint160(client))), maxFills
        );
        USDG.forceApprove(address(EXCHANGE), 0);

        if (
            creditOut == 0 || usdgSpent == 0 || usdgSpent > policy.refillAmount
                || usdgSpent > reserve
        ) {
            revert InvalidExchangeSpend();
        }

        reserves[client] = reserve - usdgSpent;
        weekEpoch[client] = epoch;
        weekSpent[client] = spent + usdgSpent;
        emit Refueled(
            client,
            usdgSpent,
            creditOut,
            activationId,
            epoch,
            spent + usdgSpent,
            quote.creditOut,
            quote.usdgSpent,
            minCreditOut,
            quote.feeAtoms,
            quote.fills,
            quote.reason
        );
    }
}
