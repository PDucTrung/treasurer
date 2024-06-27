import { expect } from 'chai';
import { ethers } from 'hardhat';
import { parseUnits, Signer } from 'ethers';
import { GPUToken, IERC20, NodeStaking } from '../typechain-types';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('NodeStaking', function () {
  let gpuToken: IERC20;
  let nodeStaking: NodeStaking;

  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let addr3: Signer;

  const amountToStake = ethers.parseUnits('100', 18); // 100 tokens

  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    owner = accounts[0];
    addr1 = accounts[1];
    addr2 = accounts[2];
    addr3 = accounts[3];

    const StakingToken = await ethers.getContractFactory('GPUToken');
    gpuToken = (await StakingToken.deploy()) as IERC20;

    await gpuToken.waitForDeployment();

    const NodeStakingContract = await ethers.getContractFactory('NodeStaking');
    nodeStaking = (await NodeStakingContract.deploy(
      await gpuToken.getAddress()
    )) as NodeStaking;

    const stakingContractAddress = await nodeStaking.getAddress();

    await gpuToken.transfer(await addr1.getAddress(), ethers.parseEther('500'));
    await gpuToken.transfer(await addr2.getAddress(), ethers.parseEther('500'));
    await gpuToken.transfer(await addr3.getAddress(), ethers.parseEther('500'));

    await gpuToken
      .connect(addr1)
      .approve(stakingContractAddress, ethers.parseEther('500'));
    await gpuToken
      .connect(addr2)
      .approve(stakingContractAddress, ethers.parseEther('500'));
    await gpuToken
      .connect(addr3)
      .approve(stakingContractAddress, ethers.parseEther('500'));
  });

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      expect(await nodeStaking.owner()).to.equal(await owner.getAddress());
    });

    it('Should set the right staking token', async function () {
      const address = await gpuToken.getAddress();
      expect(await nodeStaking.stakingToken()).to.equal(address);
    });
  });

  describe('stake', function () {
    it('Should reject staking 0 amount', async function () {
      await expect(nodeStaking.connect(addr1).stake(0)).to.be.revertedWith(
        'Amount must be greater than 0'
      );
    });

    it('Should reject staking more than maxPerWallet', async function () {
      const maxPerWallet = await nodeStaking.maxPerWallet();
      const tooMuch = maxPerWallet + 1n;
      await expect(
        nodeStaking.connect(addr1).stake(tooMuch)
      ).to.be.revertedWith('Staking limit exceeded');
    });

    it('Should reject staking when total staked would exceed maxTotalStaked', async function () {
      const maxTotalStaked = await nodeStaking.maxTotalStaked();
      // Assuming setup doesn't already exceed limits, this stake should push it over
      await expect(
        nodeStaking.connect(addr1).stake(maxTotalStaked)
      ).to.be.revertedWith('Staking limit exceeded');
    });

    it('Should allow staking under max limits', async function () {
      await expect(nodeStaking.connect(addr1).stake(amountToStake))
        .to.emit(nodeStaking, 'Staked')
        .withArgs(await addr1.getAddress(), amountToStake, 0);

      const totalStaked = await nodeStaking.totalStaked();
      expect(totalStaked).to.equal(amountToStake);
    });

    it("Should update user's staked balance correctly", async function () {
      await nodeStaking.connect(addr1).stake(amountToStake);
      const walletStaked = await nodeStaking.getWalletStaked(
        await addr1.getAddress()
      );
      expect(walletStaked).to.equal(amountToStake);
    });

    it('Should reject staking when contract is paused', async function () {
      await nodeStaking.connect(owner).setPaused(true);
      await expect(
        nodeStaking.connect(addr1).stake(amountToStake)
      ).to.be.revertedWithCustomError(nodeStaking, 'EnforcedPause');
    });
  });

  describe('unstake', function () {
    const stakeAmount = ethers.parseUnits('100', 18); // 100 tokens
    let stakingPeriod: bigint;

    beforeEach(async function () {
      // Stake tokens before each test

      await nodeStaking.connect(addr1).stake(stakeAmount);

      stakingPeriod = await nodeStaking.stakingPeriod();
    });

    it('Should fail to unstake more than staked amount', async function () {
      const tooMuch = stakeAmount + ethers.parseUnits('1', 18); // 101 tokens
      await time.increase(stakingPeriod + 1n);
      await expect(
        nodeStaking.connect(addr1).unstake(0, tooMuch)
      ).to.be.revertedWith('Insufficient staked amount');
    });

    it('Should fail to unstake before the staking period ends', async function () {
      // Trying to unstake immediately after staking, assuming stakingPeriod > 0
      await expect(
        nodeStaking.connect(addr1).unstake(0, stakeAmount)
      ).to.be.revertedWith('Stake is still locked');
    });

    it('Should successfully unstake after the staking period', async function () {
      // Fast forward time by stakingPeriod + 1 second
      await time.increase(stakingPeriod + 1n);

      await expect(nodeStaking.connect(addr1).unstake(0, stakeAmount))
        .to.emit(nodeStaking, 'Unstaked')
        .withArgs(await addr1.getAddress(), stakeAmount, 0);

      const totalStakedAfter = await nodeStaking.totalStaked();
      expect(totalStakedAfter).to.equal(0);
    });

    it('Should correctly handle partial unstaking', async function () {
      // Fast forward time to surpass the staking period
      await time.increase(stakingPeriod + 1n);

      const partialAmount = ethers.parseUnits('50', 18); // Unstaking 50 tokens
      await nodeStaking.connect(addr1).unstake(0, partialAmount);

      const remainingStake = await nodeStaking.getWalletStaked(
        await addr1.getAddress()
      );
      expect(remainingStake).to.equal(stakeAmount - partialAmount);
    });

    it('Should revert when trying to unstake from a non-existent stake index', async function () {
      await expect(nodeStaking.connect(addr1).unstake(1, stakeAmount)) // Assuming only 1 stake entry exists at index 0
        .to.be.revertedWith('Invalid stake index');
    });
  });

  describe('earlyUnstake', function () {
    const stakeAmount = ethers.parseUnits('100', 18); // 100 tokens
    let stakingPeriod: bigint;

    beforeEach(async function () {
      // Stake tokens before each test
      stakingPeriod = await nodeStaking.stakingPeriod();
      await nodeStaking.connect(addr1).stake(stakeAmount);
    });

    it('Should apply a penalty for unstaking before the staking period ends', async function () {
      const halfwayPeriod = stakingPeriod / 2n;

      await time.increase(halfwayPeriod);

      const initialUserBalance = await gpuToken.balanceOf(
        await addr1.getAddress()
      );

      const expectedPenaltyPercentage =
        (await nodeStaking.earlyUnstakePenality()) / 2n; // 25% penalty halfway through
      const expectedPenalty = (stakeAmount * expectedPenaltyPercentage) / 100n;
      const expectedReturn = stakeAmount - expectedPenalty;

      await nodeStaking.connect(addr1).earlyUnstake(0, stakeAmount);

      const deadWalletBalance = await gpuToken.balanceOf(
        await nodeStaking.deadWallet()
      );
      expect(deadWalletBalance).to.equal(expectedPenalty);

      const userBalanceAfter = await gpuToken.balanceOf(
        await addr1.getAddress()
      );
      // This calculation assumes the user had no other tokens in their balance.
      // Adjust as necessary for your testing setup.
      expect(userBalanceAfter).to.equal(initialUserBalance + expectedReturn);
    });

    it('Should revert when trying to early unstake more than staked amount', async function () {
      const tooMuch = stakeAmount + ethers.parseUnits('1', 18); // 101 tokens
      await expect(
        nodeStaking.connect(addr1).earlyUnstake(0, tooMuch)
      ).to.be.revertedWith('Insufficient staked amount');
    });

    it('Should revert when trying to early unstake from a non-existent stake index', async function () {
      await expect(nodeStaking.connect(addr1).earlyUnstake(1, stakeAmount)) // Assuming only 1 stake entry exists at index 0
        .to.be.revertedWith('Invalid stake index');
    });

    it('Should correctly handle partial early unstaking with penalties applied', async function () {
      const partialAmount = ethers.parseUnits('50', 18); // Unstaking 50 tokens early

      const stake = await nodeStaking.stakes(await addr1.getAddress(), 0);
      const stakedAt = stake.startTime;
      const timeElapsed = BigInt(await time.latest()) - stakedAt;

      const penaltyPercentage = await nodeStaking.earlyUnstakePenality();

      const expectedPenaltyPercentage =
        penaltyPercentage - (timeElapsed * penaltyPercentage) / stakingPeriod;
      const expectedPenalty =
        (partialAmount * expectedPenaltyPercentage) / 100n;

      await nodeStaking.connect(addr1).earlyUnstake(0, partialAmount);

      // Verify the penalty was applied to the partial amount
      const deadWalletBalance = await gpuToken.balanceOf(
        await nodeStaking.deadWallet()
      );
      expect(deadWalletBalance).to.equal(expectedPenalty);

      const remainingStake = await nodeStaking.getWalletStaked(
        await addr1.getAddress()
      );
      // Verify remaining stake is correct after partial early unstake
      expect(remainingStake).to.equal(stakeAmount - partialAmount);
    });

    it('Should not allow early unstaking after the staking period', async function () {
      // Fast forward time to surpass the staking period

      await time.increase(stakingPeriod + 1n);

      // Attempting early unstake should revert since it's no longer early
      await expect(
        nodeStaking.connect(addr1).earlyUnstake(0, stakeAmount)
      ).to.be.revertedWith('Stake is not in early unstake period');
    });
  });

  describe('claimRewards', function () {
    const stakeAmount = ethers.parseUnits('100', 18); // 100 tokens

    beforeEach(async function () {
      // Stake tokens before each test
      await nodeStaking.connect(addr1).stake(stakeAmount);
      // Assume rewards are accumulated over time, so we fast-forward

      await time.increase(30 * 24 * 60 * 60);
    });

    it('Should correctly claim rewards after the staking period', async function () {
      // Assuming reward calculation logic is implemented and ETH is sent to the contract for distribution
      // Send ETH to the NodeStaking contract to simulate rewards

      const rewardsAmount = ethers.parseEther('1'); // 1 ETH
      await owner.sendTransaction({
        to: await nodeStaking.getAddress(),
        value: rewardsAmount,
      });

      // Claim rewards
      const initialBalance = await ethers.provider.getBalance(
        await addr1.getAddress()
      );
      await expect(() =>
        nodeStaking.connect(addr1).claimRewards(0)
      ).to.changeEtherBalance(addr1, rewardsAmount); // This assumes the user gets all the rewards, adjust according to your logic

      // Ensure the rewards are deducted from the contract's balance
      const contractBalanceAfter = await ethers.provider.getBalance(
        await nodeStaking.getAddress()
      );
      expect(contractBalanceAfter).to.equal(0);
    });

    it('Should emit RewardPaid event upon claiming rewards', async function () {
      // Send ETH to the NodeStaking contract to simulate rewards
      await owner.sendTransaction({
        to: await nodeStaking.getAddress(),
        value: ethers.parseEther('1'), // 1 ETH
      });

      await expect(nodeStaking.connect(addr1).claimRewards(0))
        .to.emit(nodeStaking, 'RewardPaid')
        .withArgs(await addr1.getAddress(), ethers.parseEther('1')); // Adjust expected reward amount based on your logic
    });

    it('Should not allow claiming rewards if none are available', async function () {
      // Assuming no ETH sent to the contract, hence no rewards to claim

      await expect(
        nodeStaking.connect(addr1).claimRewards(0)
      ).to.be.revertedWith('No rewards available'); // Adjust error message based on your contract
    });

    it('Should not allow claiming rewards if contract has no balance', async function () {
      // Assuming no ETH sent to the contract, hence no rewards to claim

      await nodeStaking.migrate(await gpuToken.getAddress());

      await expect(
        nodeStaking.connect(addr1).claimRewards(0)
      ).to.be.revertedWith('No rewards available'); // Adjust error message based on your contract
    });

    it('Should not allow claiming rewards from a non-existent stake index', async function () {
      await expect(nodeStaking.connect(addr1).claimRewards(1)) // Assuming only 1 stake entry exists at index 0
        .to.be.revertedWith('Invalid stake index');
    });
  });

  describe('calculateReward', function () {
    let deployer: Signer, user1: Signer, user2: Signer;
    let nodeStaking: NodeStaking;
    let stakingToken: IERC20;
    const stakingAmountUser1 = ethers.parseUnits('100', 18); // 100 tokens
    const stakingAmountUser2 = ethers.parseUnits('200', 18); // 200 tokens
    const totalStaked = stakingAmountUser1 + stakingAmountUser2;
    const rewardPool = ethers.parseEther('1'); // 1 ETH as rewards

    beforeEach(async function () {
      [deployer, user1, user2] = await ethers.getSigners();
      // Deploy NodeStaking and token contracts, and set up staking
      const StakingToken = await ethers.getContractFactory(
        'GPUToken',
        deployer
      );
      stakingToken = await StakingToken.deploy();
      const NodeStakingContract = await ethers.getContractFactory(
        'NodeStaking',
        deployer
      );
      nodeStaking = await NodeStakingContract.deploy(
        await stakingToken.getAddress()
      );

      await stakingToken.transfer(await user1.getAddress(), stakingAmountUser1);
      await stakingToken.transfer(await user2.getAddress(), stakingAmountUser2);

      await stakingToken
        .connect(user1)
        .approve(await nodeStaking.getAddress(), stakingAmountUser1);
      await stakingToken
        .connect(user2)
        .approve(await nodeStaking.getAddress(), stakingAmountUser2);

      await nodeStaking.connect(user1).stake(stakingAmountUser1);
      await nodeStaking.connect(user2).stake(stakingAmountUser2);

      // Send ETH to NodeStaking contract to simulate rewards
      await deployer.sendTransaction({
        to: await nodeStaking.getAddress(),
        value: rewardPool,
      });
    });

    it('Should correctly calculate rewards based on stake proportion and contract balance', async function () {
      // Advance time by stakingPeriod to ensure rewards are calculated for the full period
      await time.increase(30 * 24 * 60 * 60); // 30 days

      const expectedRewardUser1 =
        (rewardPool * stakingAmountUser1) / totalStaked;
      const expectedRewardUser2 =
        (rewardPool * stakingAmountUser2) / totalStaked;

      const rewardUser1 = await nodeStaking.calculateReward(
        await user1.getAddress(),
        0
      );
      const rewardUser2 = await nodeStaking.calculateReward(
        await user2.getAddress(),
        0
      );

      const contractBalance = await ethers.provider.getBalance(
        await nodeStaking.getAddress()
      );

      expect(rewardUser1).to.be.closeTo(
        expectedRewardUser1,
        ethers.parseEther('0.01')
      );
      expect(rewardUser2).to.be.closeTo(
        expectedRewardUser2,
        ethers.parseEther('0.01')
      );
    });

    it('Should account for staking duration within the reward calculation', async function () {
      // Simulate partial staking period
      const partialPeriod = 15 * 24 * 60 * 60; // 15 days

      await time.increase(partialPeriod);

      // Assuming rewards are linearly distributed over the staking period
      const partialRewardUser1 =
        (((rewardPool * stakingAmountUser1) / totalStaked) *
          BigInt(partialPeriod)) /
        BigInt(30 * 24 * 60 * 60);
      const partialRewardUser2 =
        (((rewardPool * stakingAmountUser2) / totalStaked) *
          BigInt(partialPeriod)) /
        BigInt(30 * 24 * 60 * 60);

      const rewardUser1 = await nodeStaking.calculateReward(
        await user1.getAddress(),
        0
      );
      const rewardUser2 = await nodeStaking.calculateReward(
        await user2.getAddress(),
        0
      );

      const contractBalance = await ethers.provider.getBalance(
        await nodeStaking.getAddress()
      );

      expect(rewardUser1).to.be.closeTo(
        partialRewardUser1,
        ethers.parseEther('0.01')
      );
      expect(rewardUser2).to.be.closeTo(
        partialRewardUser2,
        ethers.parseEther('0.01')
      );
    });
  });
  describe('calculateReward - multiple users', function () {
    let deployer: Signer, user1: Signer, user2: Signer;
    let nodeStaking: NodeStaking;
    let stakingToken: GPUToken;
    const stakingAmountUser1 = ethers.parseUnits('100', 18); // 100 tokens
    const additionalStakeAmount = ethers.parseUnits('50', 18); // 50 tokens
    const rewardPool = ethers.parseEther('1'); // 1 ETH as rewards

    beforeEach(async function () {
      [deployer, user1, user2] = await ethers.getSigners();
      const StakingToken = await ethers.getContractFactory(
        'GPUToken',
        deployer
      );
      stakingToken = await StakingToken.deploy();
      const NodeStakingContract = await ethers.getContractFactory(
        'NodeStaking',
        deployer
      );
      nodeStaking = await NodeStakingContract.deploy(
        await stakingToken.getAddress()
      );

      await stakingToken.transfer(
        await user1.getAddress(),
        stakingAmountUser1 + additionalStakeAmount
      );
      await stakingToken
        .connect(user1)
        .approve(
          await nodeStaking.getAddress(),
          stakingAmountUser1 + additionalStakeAmount
        );

      // Send ETH to NodeStaking contract to simulate rewards
      await deployer.sendTransaction({
        to: await nodeStaking.getAddress(),
        value: rewardPool,
      });
    });

    it('Handles multiple stakes by the same user correctly', async function () {
      await stakingToken
        .connect(user1)
        .approve(await nodeStaking.getAddress(), parseUnits('100000', 18));

      // User makes the first stake
      await nodeStaking.connect(user1).stake(stakingAmountUser1);

      // Simulate time passage for the first stake to accumulate some rewards
      await time.increase(15 * 24 * 60 * 60);

      // User makes a second stake
      await nodeStaking.connect(user1).stake(additionalStakeAmount);

      // More time passes, allowing both stakes to accumulate rewards
      await time.increase(15 * 24 * 60 * 60);

      const contractBalance = BigInt(
        await ethers.provider.getBalance(await nodeStaking.getAddress())
      );
      const stakingPeriod = BigInt(await nodeStaking.stakingPeriod());

      const durationFirstStake = 30 * 24 * 60 * 60;
      const durationSecondStake = 15 * 24 * 60 * 60;

      const totalStaked = stakingAmountUser1 + additionalStakeAmount;

      // Calculate expected rewards for each stake
      // Calculate expected rewards for each stake independently, without dividing by the total staked after second stake
      const expectedRewardFirstStake =
        (contractBalance * stakingAmountUser1 * BigInt(durationFirstStake)) /
        stakingPeriod /
        totalStaked;

      // Claim rewards for both stakes
      await nodeStaking.connect(user1).claimRewards(0);

      const contractBalanceAfterFirstClaim = await ethers.provider.getBalance(
        nodeStaking.getAddress()
      );
      const expectedRewardSecondStake =
        (contractBalanceAfterFirstClaim *
          additionalStakeAmount *
          BigInt(durationSecondStake)) /
        stakingPeriod /
        totalStaked;

      await nodeStaking.connect(user1).claimRewards(1);

      // Verification step
      const expectedTotalRewards =
        expectedRewardFirstStake + expectedRewardSecondStake;
      const contractBalanceAfterClaims = BigInt(
        await ethers.provider.getBalance(await nodeStaking.getAddress())
      );
      const expectedContractBalanceAfter =
        contractBalance - expectedTotalRewards;

      expect(contractBalanceAfterClaims).to.be.closeTo(
        expectedContractBalanceAfter,
        ethers.parseEther('0.02')
      );
    });
  });
});
