// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

struct Rental {
  address renter;
  address lender;
  uint256 pendingAmount;
  uint256 totalAmount;
  uint256 pendingDisputeAmount;
  uint256 totalDisputeAmount;
  uint256 startTime;
  uint256 endTime;
  bool ended;
  bool active;
}

contract NodeTreasurer is ReentrancyGuard {
  // The owner of the contract
  address public owner;

  // The system that will call the functions
  address private system;

  // The staking contract that implements a depositReward function
  address public stakingContract;

  // The rentals
  mapping(bytes32 => Rental) public rentals;

  // Whether new rentals are paused
  bool public isPaused;

  // The percentage of revenue to share
  uint256 public revenueSharePercentage;

  // The total revenue shared
  uint256 public totalRevenueShared;

  // Events
  event Deposit(bytes32 key, uint256 amount);
  event Withdraw(bytes32 key, uint256 amount);
  event Dispute(bytes32 key, uint256 disputeAmount);
  event Refund(bytes32 key, uint256 amount);
  event Migrated(address indexed newTreasurer, uint256 ethAmount);

  constructor() {
    owner = msg.sender;
  }

  modifier onlySystem() {
    require(
      msg.sender == system || msg.sender == owner,
      'Only system can call this function.'
    );
    _;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, 'Only owner can call this function.');
    _;
  }

  /* Will be called by owner to set the system */
  function setSystem(address _system) external onlyOwner {
    system = _system;
  }

  /* Will be called by our systems to set the revenue share percentage */
  function setRevenueSharePercentage(
    uint256 _revenueSharePercentage
  ) external onlyOwner {
    require(
      _revenueSharePercentage <= 100,
      'Revenue share percentage must be less than or equal to 100'
    );

    revenueSharePercentage = _revenueSharePercentage;
  }

  /* Will be called by our systems to set the staking contract */
  function setStakingContract(address _stakingContract) external onlyOwner {
    stakingContract = _stakingContract;
  }

  /* Will be called by our systems to pause new rentals */
  function pause(bool state) external onlyOwner {
    require(state != isPaused, 'State is already set to this value');
    isPaused = state;
  }

  /* Will be called by the renter to deposit the rental amount */
  function deposit(bytes32 key) external payable nonReentrant {
    require(msg.value > 0, 'Deposit must be greater than 0');
    require(!isPaused, 'Rentals are paused');
    require(rentals[key].totalAmount == 0, 'Rental already exists');

    Rental storage rental = rentals[key];
    rental.renter = msg.sender;

    rental.pendingAmount = msg.value;
    rental.totalAmount = msg.value;
    rental.pendingDisputeAmount = 0;
    rental.totalDisputeAmount = 0;

    rental.active = false;

    emit Deposit(key, msg.value);
  }

  /* Will be called by the renter to withdraw the rental amount */
  function withdraw(bytes32 key) external nonReentrant {
    Rental storage rental = rentals[key];

    require(block.timestamp >= rental.endTime, 'Rental period has not ended');
    require(rental.active, 'Rental is not active');
    require(!rental.ended, 'Rental has already ended');
    require(msg.sender == rental.lender, 'Only lender can withdraw');
    require(stakingContract != address(0), 'Staking contract is not set');

    uint256 amountToPay = rental.totalAmount - rental.totalDisputeAmount;

    rental.ended = true;
    rental.pendingAmount = 0;

    uint256 revenueShare = (amountToPay * revenueSharePercentage) / 100;
    uint256 amountToWithdraw = amountToPay - revenueShare;

    (bool sent, ) = stakingContract.call{value: revenueShare}('');
    require(sent, 'Failed to send revenue share amount to staking contract');
    totalRevenueShared += revenueShare;

    (bool withdrawSent, ) = msg.sender.call{value: amountToWithdraw}('');
    require(withdrawSent, 'Failed to send amount to withdraw');

    emit Withdraw(key, amountToWithdraw);
  }

  /* Will be called by the lender to claim the refund */
  function claimRefund(bytes32 key) external nonReentrant {
    Rental storage rental = rentals[key];

    require(msg.sender == rental.renter, 'Only renter can claim refund');
    require(rental.pendingDisputeAmount > 0, 'No dispute amount to refund');

    (bool disputeSent, ) = msg.sender.call{value: rental.pendingDisputeAmount}(
      ''
    );
    require(disputeSent, 'Failed to send dispute amount');

    emit Refund(key, rental.pendingDisputeAmount);

    rental.pendingDisputeAmount = 0;
  }

  /* Will be set from our systems and starts the rental period */
  function setRentalInfo(
    bytes32 key,
    address lender,
    uint256 endTime
  ) external onlySystem {
    Rental storage rental = rentals[key];

    rental.lender = lender;
    rental.startTime = block.timestamp;
    rental.endTime = endTime;
    rental.active = true;
  }

  /* Will be set from our systems that detects uptime */
  function raiseDispute(
    bytes32 key,
    uint256 disputeAmount
  ) external onlySystem {
    Rental storage rental = rentals[key];

    require(rental.active, 'Rental is not active');
    require(disputeAmount > 0, 'Dispute amount must be greater than 0');
    require(
      disputeAmount <= rental.totalAmount - rental.totalDisputeAmount,
      'Dispute amount exceeds rental amount'
    );

    rental.pendingDisputeAmount += disputeAmount;
    rental.totalDisputeAmount += disputeAmount;

    emit Dispute(key, disputeAmount);
  }

  /* Migrates the treasurer contract to a new contract */
  function migrate(address _newStakingContract) external onlyOwner {
    require(_newStakingContract != address(0), 'Invalid address');

    uint256 contractETHBalance = address(this).balance;
    (bool sent, ) = _newStakingContract.call{value: contractETHBalance}('');

    require(sent, 'Failed to transfer ETH');

    emit Migrated(
      _newStakingContract,
      contractETHBalance
    );
  }

  receive() external payable {}
}
