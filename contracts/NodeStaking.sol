// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';

interface IERC20 {
  function transfer(address recipient, uint256 amount) external returns (bool);

  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external returns (bool);

  function balanceOf(address account) external view returns (uint256);

  function approve(address spender, uint256 value) external returns (bool);
}

contract NodeStaking is ReentrancyGuard, Ownable, Pausable {
  IERC20 public stakingToken;

  struct Stake {
    uint256 amount;
    uint256 startTime;
    uint256 rewardPaid;
  }

  mapping(address => Stake[]) public stakes;
  mapping(address => uint256) public totalUserRewards;

  address[] public stakers;
  mapping(address => bool) public isStaker;

  uint256 public totalRewards = 0;

  uint256 public totalStaked;

  uint256 public earlyUnstakePenality = 30;

  uint256 public maxTotalStaked = 10_000_000 * (10 ** 18); // Example: 10 million tokens
  uint256 public maxPerWallet = 1_000 * (10 ** 18); // Example: 1,000 tokens per wallet

  uint256 public constant stakingPeriod = 30 days;
  address public constant deadWallet =
    0x000000000000000000000000000000000000dEaD;

  event Staked(address indexed user, uint256 amount, uint256 index);
  event Unstaked(address indexed user, uint256 amount, uint256 index);
  event RewardPaid(address indexed user, uint256 reward);
  event Migrated(
    address indexed newStakingContract,
    uint256 tokenAmount,
    uint256 ethAmount
  );

  /* Initializes the constructure with the staking token set and owner */
  constructor(address _stakingToken) Ownable(_msgSender()) {
    stakingToken = IERC20(_stakingToken);
  }

  /* Sets the staking token */
  function setStakingToken(address _stakingToken) external onlyOwner {
    require(_stakingToken != address(0), 'Invalid address');

    stakingToken = IERC20(_stakingToken);
  }

  /* Sets the maximum total staked amount */
  function setMaxTotalStaked(uint256 _maxTotalStaked) external onlyOwner {
    maxTotalStaked = _maxTotalStaked;
  }

  /* Sets the maximum staked amount per wallet */
  function setMaxPerWallet(uint256 _maxPerWallet) external onlyOwner {
    maxPerWallet = _maxPerWallet;
  }

  /* Sets the pause state of the contract */
  function setPaused(bool _paused) external onlyOwner {
    require(_paused != paused(), 'Already in the requested state');

    if (_paused) {
      _pause();
    } else {
      _unpause();
    }
  }

  /* Migrates the staking contract to a new contract */
  function migrate(address _newStakingContract) external onlyOwner {
    require(_newStakingContract != address(0), 'Invalid address');

    uint256 contractTokenBalance = stakingToken.balanceOf(address(this));
    require(
      stakingToken.transfer(_newStakingContract, contractTokenBalance),
      'Failed to transfer tokens to owner'
    );

    uint256 contractETHBalance = address(this).balance;
    (bool sent, ) = _newStakingContract.call{value: contractETHBalance}('');

    require(sent, 'Failed to transfer ETH');

    emit Migrated(
      _newStakingContract,
      contractTokenBalance,
      contractETHBalance
    );
  }

  function stake(uint256 _amount) external nonReentrant whenNotPaused {
    require(_amount > 0, 'Amount must be greater than 0');
    require(totalStaked + _amount <= maxTotalStaked, 'Staking limit exceeded');

    uint256 walletStaked = getWalletStaked(msg.sender);
    require(walletStaked + _amount <= maxPerWallet, 'Staking limit exceeded');

    if(!isStaker[msg.sender]) {
      stakers.push(msg.sender);
      isStaker[msg.sender] = true;
    }

    bool success = stakingToken.transferFrom(msg.sender, address(this), _amount);
    require(success, 'Failed to transfer tokens');
    stakes[msg.sender].push(Stake(_amount, block.timestamp, 0));
    totalStaked += _amount;

    emit Staked(msg.sender, _amount, stakes[msg.sender].length - 1);
  }

  function unstake(uint256 _index, uint256 _amount) external nonReentrant {
    require(_index < stakes[msg.sender].length, 'Invalid stake index');

    Stake storage userStake = stakes[msg.sender][_index];

    require(
      block.timestamp >= userStake.startTime + stakingPeriod,
      'Stake is still locked'
    );

    require(userStake.amount >= _amount, 'Insufficient staked amount');

    uint256 reward = _claimRewards(msg.sender, _index);

    if(reward > 0) {
      (bool sent, ) = payable(msg.sender).call{value: reward}('');
      require(sent, 'Failed to send Ether');

      emit RewardPaid(msg.sender, reward);
    }

    userStake.amount -= _amount;
    totalStaked -= _amount;

    if (userStake.amount == 0) {
      removeStake(msg.sender, _index);
    }

    bool success = stakingToken.transfer(msg.sender, _amount);
    require(success, 'Failed to transfer tokens');
    emit Unstaked(msg.sender, _amount, _index);
  }

  function earlyUnstake(uint256 _index, uint256 _amount) external nonReentrant {
    require(_index < stakes[msg.sender].length, 'Invalid stake index');

    Stake storage userStake = stakes[msg.sender][_index];
    require(userStake.amount >= _amount, 'Insufficient staked amount');

    uint256 timeElapsed = block.timestamp - userStake.startTime;
    require(
      timeElapsed < stakingPeriod,
      'Stake is not in early unstake period'
    );

    uint256 reward = _claimRewards(msg.sender, _index);

    if(reward > 0) {
      (bool sent, ) = payable(msg.sender).call{value: reward}('');
      require(sent, 'Failed to send Ether');

      emit RewardPaid(msg.sender, reward);
    }

    // Calculate the penalty fee, which linearly decreases from 50% to 0% over the lock-up period
    uint256 penaltyPercentage = earlyUnstakePenality -
      ((timeElapsed * earlyUnstakePenality) / stakingPeriod);
    uint256 penaltyAmount = (_amount * penaltyPercentage) / 100;

    // Apply the penalty
    uint256 returnAmount = _amount - penaltyAmount;

    // Update the stake and total staked amount
    userStake.amount -= _amount;
    totalStaked -= _amount;

    // Burn the penalty amount
    bool successBurn = stakingToken.transfer(deadWallet, penaltyAmount);
    require(successBurn, 'Failed to burn tokens');

    // Return the remaining tokens to the user
    bool sucessUnstake = stakingToken.transfer(msg.sender, returnAmount);
    require(sucessUnstake, 'Failed to transfer tokens');

    // Remove the stake if it's fully unstaked
    if (userStake.amount == 0) {
      removeStake(msg.sender, _index);
    }

    emit Unstaked(msg.sender, returnAmount, _index);
  }

  function _claimRewards(
    address user,
    uint256 index
  ) private returns (uint256) {
    require(index < stakes[user].length, 'Invalid stake index');

    Stake storage userStake = stakes[user][index];
    uint256 reward = calculateReward(user, index);

    if (reward > 0) {
      userStake.rewardPaid += reward;
      totalUserRewards[user] += reward;
      totalRewards += reward;
    }

    return reward;
  }

  function claimRewards() external nonReentrant {
    uint256 stakeCount = stakes[msg.sender].length;
    require(stakeCount > 0, 'No stakes available');

    uint256 totalReward = 0;
    for (uint256 i = 0; i < stakeCount; i++) {
      totalReward += _claimRewards(msg.sender, i); // Aggregate rewards
    }

    if(totalReward <= 0) {
      return;
    }

    (bool sent, ) = payable(msg.sender).call{value: totalReward}('');
    require(sent, 'Failed to send Ether');

    emit RewardPaid(msg.sender, totalReward);
  }

  function getWalletStaked(address _user) public view returns (uint256) {
    uint256 walletStaked = 0;

    for (uint256 i = 0; i < stakes[_user].length; i++) {
      walletStaked += stakes[_user][i].amount;
    }

    return walletStaked;
  }

  function getWalletReward(address _user) public view returns (uint256) {
    uint256 walletReward = 0;

    for (uint256 i = 0; i < stakes[_user].length; i++) {
      walletReward += stakes[_user][i].rewardPaid;
    }

    return walletReward;
  }

  function getWalletStakes(address _user) public view returns (Stake[] memory) {
    return stakes[_user];
  }

  function getWalletClaimableRewards(
    address _user
  ) public view returns (uint256 totalClaimable) {
    totalClaimable = 0;
    for (uint256 i = 0; i < stakes[_user].length; i++) {
      uint256 reward = calculateReward(_user, i);
      totalClaimable += reward;
    }
  }

  function calculateAllPendingRewards() public view returns (uint256 totalClaimable) {
    totalClaimable = 0;
    for (uint256 i = 0; i < stakers.length; i++) {
      address staker = stakers[i];
      totalClaimable += getWalletClaimableRewards(staker);
    }
  }

  function calculateReward(
    address _user,
    uint256 _index
  ) public view returns (uint256) {
    Stake storage userStake = stakes[_user][_index];
    uint256 stakeDuration = block.timestamp - userStake.startTime;
    if (stakeDuration > stakingPeriod) {
      stakeDuration = stakingPeriod; // Cap the stake duration to the lock-up period for reward calculation
    }
    // Scale the numerator before dividing
    uint256 scaledReward = (address(this).balance *
      userStake.amount *
      stakeDuration) / stakingPeriod;
    uint256 reward = scaledReward / totalStaked;

    if(userStake.rewardPaid > reward) {
      return 0;
    }

    return reward - userStake.rewardPaid; // Assuming rewardPaid is correctly managed elsewhere
  }

  function getUserStakingDetails(
    address _user
  )
    public
    view
    returns (
      uint256 _totalStaked,
      uint256 totalRewardsInEth,
      uint256[] memory timeElapsedPerStake
    )
  {
    _totalStaked = 0;
    totalRewardsInEth = 0;
    timeElapsedPerStake = new uint256[](stakes[_user].length);

    for (uint256 i = 0; i < stakes[_user].length; i++) {
      _totalStaked += stakes[_user][i].amount;
      totalRewardsInEth += calculateReward(_user, i); // This should return ETH rewards
      timeElapsedPerStake[i] = block.timestamp - stakes[_user][i].startTime;
    }
  }

  function removeStake(address _user, uint256 _index) private {
    require(_index < stakes[_user].length, 'Invalid stake index');

    stakes[_user][_index] = stakes[_user][stakes[_user].length - 1];
    stakes[_user].pop();
  }

  receive() external payable {}
}
