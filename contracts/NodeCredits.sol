// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import '@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol';
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol';
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract NodeCredits is Initializable, ContextUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {

  enum BalanceUpdateReason {
    Deposit,
    Withdraw,
    Refund,
    Reserve,
    RemoveReserve,
    Payment,
    Income
  }
  address public stakingContract;

  // Exchange rate from ETH to credits
  uint256 public constant EXCHANGE_RATE = 100_000;

  // Owner or system account address
  address public systemAccount;

  // Mapping from addresses to their credit balance
  mapping(address => uint256) public balances;

  // Mapping from address to their reserved balance, e.g. for rentals
  mapping(address => uint256) public reserves;

  // Events
  event BalanceUpdated(address indexed user, uint256 creditAmount, BalanceUpdateReason reason);
  event FundsMigrated(address owner, uint256 ethAmount);


  function initialize(address _systemAccount, address _stakingContract) public initializer {
    __Context_init();
    __Ownable_init(_msgSender());
    __ReentrancyGuard_init();
    __Pausable_init();

    systemAccount = _systemAccount;
    stakingContract = _stakingContract;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  // Modifier to restrict to system account only
  modifier onlySystem() {
    require(msg.sender == systemAccount, "Unauthorized: caller is not the system account");
    _;
  }

  // Update system account
  function setSystemAccount(address _systemAccount) public onlyOwner {
    systemAccount = _systemAccount;
  }

  // Update staking contract
  function setStakingContract(address _stakingContract) public onlyOwner {
    stakingContract = _stakingContract;
  }

  // Function to deposit ETH and receive credits
  function deposit() public payable nonReentrant whenNotPaused {
    require(msg.value > 0, "Deposit amount must be greater than 0");

    uint256 credits = msg.value * EXCHANGE_RATE;

    balances[msg.sender] += credits;

    emit BalanceUpdated(msg.sender, credits, BalanceUpdateReason.Deposit);
  }

  // Function to withdraw ETH based on available allowance
  function withdraw(uint256 creditAmount) public nonReentrant whenNotPaused {
    require(creditAmount > 0, "Withdrawal amount must be greater than 0");

    require(balances[msg.sender] - reserves[msg.sender] >= creditAmount, "Insufficient allowance");

    uint256 ethAmount = creditAmount / EXCHANGE_RATE;

    require(address(this).balance >= ethAmount, "Insufficient ETH in contract");

    balances[msg.sender] -= creditAmount;

    (bool sent,) = payable(msg.sender).call{value: ethAmount}('');
    require(sent, "Failed to send Ether");

    emit BalanceUpdated(msg.sender, creditAmount, BalanceUpdateReason.Withdraw);
  }

  // Public function to view allowance of a wallet
  function getAvailableBalance(address user) public view returns (uint256) {
    return balances[user] - reserves[user];
  }

  // Public function to get the credits exchange rate
  function getExchangeRate() public pure returns (uint256) {
    return EXCHANGE_RATE;
  }

  // System function to move funds from User A to User B
  function transferCreditsFromReserve(address from, address to, uint256 creditAmount, uint256 disputeAmount, uint256 gasAmount) public onlySystem {
    require(reserves[from] >= creditAmount + disputeAmount, "Insufficient reserves to transfer");
    require(balances[from] >= creditAmount + disputeAmount, "Insufficient balance to transfer");

    // If there's a dispute, adjust the balance for dispute amount
    if (disputeAmount > 0) {
      reserves[from] -= disputeAmount; // Adjusting the reserved amount

      emit BalanceUpdated(from, disputeAmount, BalanceUpdateReason.Refund);
    }

    uint256 receiverAmountBeforeRevShare = creditAmount - gasAmount;
    // apply 25% rev share fee to the receiver
    uint256 revenueShareFee = receiverAmountBeforeRevShare * 25 / 100;
    uint256 receiverAmountAfterRevShare = receiverAmountBeforeRevShare - revenueShareFee;

    uint256 revShareEtherAmount = revenueShareFee / EXCHANGE_RATE;

    reserves[from] -= creditAmount;
    balances[from] -= creditAmount;
    balances[to] += receiverAmountAfterRevShare;

    (bool sent,) = payable(stakingContract).call{value: revShareEtherAmount}('');
    require(sent, "Failed to send revenue share to staking contract");

    balances[systemAccount] += gasAmount;

    emit BalanceUpdated(from, creditAmount, BalanceUpdateReason.Payment);
    emit BalanceUpdated(to, receiverAmountAfterRevShare, BalanceUpdateReason.Income);
  }

  // System function to reserve allowance until rental is over
  function reserveCredits(address user, uint256 creditAmount) public onlySystem {
    require(balances[user] >= creditAmount, "Insufficient balance to reserve");

    reserves[user] += creditAmount;
    emit BalanceUpdated(user, creditAmount, BalanceUpdateReason.Reserve);
  }

  function removeReserveCredits(address user, uint256 creditAmount) public onlySystem {
    require(reserves[user] >= creditAmount, "Insufficient reserves to remove");

    reserves[user] -= creditAmount;
    emit BalanceUpdated(user, creditAmount, BalanceUpdateReason.RemoveReserve);
  }

  // Owner function to withdraw all funds in case of migration
  function migrateFunds() public onlyOwner {
    uint256 ethAmount = address(this).balance;

    (bool sent,) = payable(msg.sender).call{value: ethAmount}('');
    require(sent, "Failed to send Ether");
    emit FundsMigrated(owner(), ethAmount);
  }

  // Fallback function to prevent accidental ETH sending
  receive() external payable {
    revert("Please use the deposit function");
  }
}
