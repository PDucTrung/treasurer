import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { encodeBytes32String, parseEther } from 'ethers';

describe('NodeTreasurer', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployTreasurer() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const NodeTreasurer = await ethers.getContractFactory('NodeTreasurer');
    const treasurer = await NodeTreasurer.deploy();

    return { treasurer, owner, otherAccount };
  }

  async function deployTreasurerAndStakingContractWithOngoingRental() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const NodeTreasurer = await ethers.getContractFactory('NodeTreasurer');
    const treasurer = await NodeTreasurer.deploy();

    await treasurer.setStakingContract(otherAccount.address);
    await treasurer.setRevenueSharePercentage(20);

    const key = ethers.encodeBytes32String('1234');

    await treasurer.deposit(key, {
      value: parseEther('1'),
    });

    await treasurer.setRentalInfo(key, otherAccount.address, 0);

    return { treasurer, owner, otherAccount, key };
  }

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      const { treasurer, owner } = await loadFixture(deployTreasurer);

      expect(await treasurer.owner()).to.equal(owner.address);
    });
  });

  describe('Settings', function () {
    describe('setSystem', function () {
      it('Should revert because we are not the owner', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await expect(
          treasurer.connect(otherAccount).setSystem(otherAccount.address)
        ).to.be.revertedWith('Only owner can call this function.');
      });

      it('Should set the system', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await treasurer.setSystem(otherAccount.address);
      });
    });
    describe('setRevenueSharePercentage', function () {
      it('Should revert because we are not the owner', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await expect(
          treasurer.connect(otherAccount).setRevenueSharePercentage(123)
        ).to.be.revertedWith('Only owner can call this function.');
      });

      it('Should revert because we set a higher rev share percentage', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await expect(
          treasurer.setRevenueSharePercentage(123)
        ).to.be.revertedWith(
          'Revenue share percentage must be less than or equal to 100'
        );
      });

      it('Should set the revenue share percentage', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        // We can increase the time in Hardhat Network
        await treasurer.setRevenueSharePercentage(80);

        // We use lock.connect() to send a transaction from another account
        expect(await treasurer.revenueSharePercentage()).to.equal(80);
      });
    });

    describe('setStakingContract', function () {
      it('Should revert because we are not the owner', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await expect(
          treasurer
            .connect(otherAccount)
            .setStakingContract(otherAccount.address)
        ).to.be.revertedWith('Only owner can call this function.');
      });

      it('Should set the staking contract', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await treasurer.setStakingContract(otherAccount.address);

        expect(await treasurer.stakingContract()).to.equal(
          otherAccount.address
        );
      });
    });

    describe('pause', function () {
      it('Should revert because we are not the owner', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await expect(
          treasurer.connect(otherAccount).pause(true)
        ).to.be.revertedWith('Only owner can call this function.');
      });

      it('should revert because the contract is already paused', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await treasurer.pause(true);

        await expect(treasurer.pause(true)).to.be.revertedWith(
          'State is already set to this value'
        );
      });

      it('Should pause the contract', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await treasurer.pause(true);

        expect(await treasurer.isPaused()).to.equal(true);
      });

      it('Should unpause the contract', async function () {
        const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

        await treasurer.pause(true);
        await treasurer.pause(false);

        expect(await treasurer.isPaused()).to.equal(false);
      });
    });
  });

  describe('Deposit', function () {
    it('Should revert because the contract is paused', async function () {
      const key = '1234';
      const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

      await treasurer.pause(true);

      await expect(
        treasurer.deposit(ethers.encodeBytes32String(key), {
          value: parseEther('1'),
        })
      ).to.be.revertedWith('Rentals are paused');
    });

    it('Should revert because the sent value is 0', async function () {
      const key = '1234';
      const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

      await expect(
        treasurer.deposit(ethers.encodeBytes32String(key), {
          value: parseEther('0'),
        })
      ).to.be.revertedWith('Deposit must be greater than 0');
    });

    it('Should revert because the key is already used', async function () {
      const key = '1234';
      const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

      await treasurer.deposit(ethers.encodeBytes32String(key), {
        value: parseEther('1'),
      });

      await expect(
        treasurer.deposit(ethers.encodeBytes32String(key), {
          value: parseEther('1'),
        })
      ).to.be.revertedWith('Rental already exists');
    });

    it('Should deposit the funds', async function () {
      const key = '1234';
      const { treasurer, owner, otherAccount } = await loadFixture(
        deployTreasurer
      );

      await treasurer.deposit(ethers.encodeBytes32String(key), {
        value: parseEther('1'),
      });

      expect(
        await ethers.provider.getBalance(await treasurer.getAddress())
      ).to.equal(parseEther('1'));

      const [
        renter,
        lender,
        pendingAmount,
        totalAmount,
        pendingDisputeAmount,
        totalDisputeAmount,
        startTime,
        endTime,
        ended,
        active,
      ] = await treasurer.rentals(ethers.encodeBytes32String(key));

      expect(renter).to.equal(owner.address);
      expect(pendingAmount).to.equal(parseEther('1'));
      expect(active).to.equal(false);
      expect(ended).to.equal(false);
      expect(pendingDisputeAmount).to.equal(0);
      expect(startTime).to.equal(0);
      expect(endTime).to.equal(0);
      expect(lender).to.equal('0x' + '0'.repeat(40));
    });
  });

  describe('Withdraw', function () {
    it('Should revert because the rental period has not ended', async function () {
      const key = '1234';
      const { treasurer, owner, otherAccount } = await loadFixture(
        deployTreasurer
      );

      await treasurer.deposit(ethers.encodeBytes32String(key), {
        value: parseEther('1'),
      });
      await treasurer.setRentalInfo(
        ethers.encodeBytes32String(key),
        otherAccount.address,
        new Date().getTime() + 1000
      );

      await expect(
        treasurer.withdraw(ethers.encodeBytes32String(key))
      ).to.be.revertedWith('Rental period has not ended');
    });

    it('Should revert because the rental has already ended', async function () {
      const key = '1234';
      const { treasurer, owner, otherAccount } = await loadFixture(
        deployTreasurer
      );

      await treasurer.deposit(ethers.encodeBytes32String(key), {
        value: parseEther('1'),
      });
      await treasurer.setRentalInfo(
        ethers.encodeBytes32String(key),
        otherAccount.address,
        0
      );
      await treasurer.setStakingContract(otherAccount.address);
      await treasurer
        .connect(otherAccount)
        .withdraw(ethers.encodeBytes32String(key));

      await expect(
        treasurer
          .connect(otherAccount)
          .withdraw(ethers.encodeBytes32String(key))
      ).to.be.revertedWith('Rental has already ended');
    });

    it('Should revert because the rental is not active', async () => {
      const key = '1234';
      const { treasurer, owner, otherAccount } = await loadFixture(
        deployTreasurer
      );

      await treasurer.deposit(ethers.encodeBytes32String(key), {
        value: parseEther('1'),
      });

      await expect(
        treasurer.withdraw(ethers.encodeBytes32String(key))
      ).to.be.revertedWith('Rental is not active');
    });

    it('Should revert because sender is not the lender', async () => {
      const key = '1234';
      const { treasurer, owner, otherAccount } = await loadFixture(
        deployTreasurer
      );

      await treasurer.deposit(ethers.encodeBytes32String(key), {
        value: parseEther('1'),
      });
      await treasurer.setRentalInfo(
        ethers.encodeBytes32String(key),
        otherAccount.address,
        0
      );

      await expect(
        treasurer.withdraw(ethers.encodeBytes32String(key))
      ).to.be.revertedWith('Only lender can withdraw');
    });

    it('Should revert because the staking contract is not set', async () => {
      const key = '1234';
      const { treasurer, owner, otherAccount } = await loadFixture(
        deployTreasurer
      );

      await treasurer.deposit(ethers.encodeBytes32String(key), {
        value: parseEther('1'),
      });
      await treasurer.setRentalInfo(
        ethers.encodeBytes32String(key),
        otherAccount.address,
        0
      );
      await treasurer.setStakingContract('0x' + '0'.repeat(40));

      await expect(
        treasurer
          .connect(otherAccount)
          .withdraw(ethers.encodeBytes32String(key))
      ).to.be.revertedWith('Staking contract is not set');
    });

    it('Should withdraw the funds and increase revenue share stats', async () => {
      const key = '1234';
      const { treasurer, owner, otherAccount } = await loadFixture(
        deployTreasurer
      );

      await treasurer.deposit(ethers.encodeBytes32String(key), {
        value: parseEther('1'),
      });
      await treasurer.setRevenueSharePercentage(20);
      await treasurer.setRentalInfo(
        ethers.encodeBytes32String(key),
        otherAccount.address,
        0
      );
      await treasurer.setStakingContract(owner.address);

      const balanceBefore = await ethers.provider.getBalance(owner.address);

      await expect(
        treasurer
          .connect(otherAccount)
          .withdraw(ethers.encodeBytes32String(key))
      )
        .to.emit(treasurer, 'Withdraw')
        .withArgs(encodeBytes32String(key), parseEther('0.8'));

      expect(
        await ethers.provider.getBalance(await treasurer.getAddress())
      ).to.equal(parseEther('0'));
      expect(await treasurer.totalRevenueShared()).to.equal(parseEther('0.2'));
      expect(await ethers.provider.getBalance(owner.address)).to.gt(
        balanceBefore
      );
    });
  });

  describe('Claim Refund', function () {
    it('Should revert because sender is not lender', async () => {
      const { treasurer, key, owner, otherAccount } = await loadFixture(
        deployTreasurerAndStakingContractWithOngoingRental
      );

      await treasurer.raiseDispute(key, parseEther('0.5'));

      await expect(
        treasurer.connect(otherAccount).claimRefund(key)
      ).to.be.revertedWith('Only renter can claim refund');
    });

    it('Should revert because the dispute amount is 0', async () => {
      const { treasurer, key, owner, otherAccount } = await loadFixture(
        deployTreasurerAndStakingContractWithOngoingRental
      );

      await expect(treasurer.claimRefund(key)).to.be.revertedWith(
        'No dispute amount to refund'
      );
    });

    it('Should claim the refund', async () => {
      const { treasurer, key, owner, otherAccount } = await loadFixture(
        deployTreasurerAndStakingContractWithOngoingRental
      );

      await treasurer.raiseDispute(key, parseEther('0.5'));

      await expect(treasurer.claimRefund(key))
        .to.emit(treasurer, 'Refund')
        .withArgs(key, parseEther('0.5'));
    });
  });

  describe('Raise Dispute', function () {
    it('should revert because we are neither system nor owner', async () => {
      const { treasurer, key, owner, otherAccount } = await loadFixture(
        deployTreasurerAndStakingContractWithOngoingRental
      );

      await expect(
        treasurer.connect(otherAccount).raiseDispute(key, parseEther('0.5'))
      ).to.be.revertedWith('Only system can call this function.');
    });

    it('Should revert because the rental is not active', async () => {
      const key = '1234';
      const { treasurer, owner, otherAccount } = await loadFixture(
        deployTreasurer
      );

      await treasurer.deposit(ethers.encodeBytes32String(key), {
        value: parseEther('1'),
      });

      await expect(
        treasurer.raiseDispute(
          ethers.encodeBytes32String(key),
          parseEther('0.5')
        )
      ).to.be.revertedWith('Rental is not active');
    });

    it('should revert because the dispute amount is 0', async () => {
      const { treasurer, key, owner, otherAccount } = await loadFixture(
        deployTreasurerAndStakingContractWithOngoingRental
      );

      await expect(
        treasurer.raiseDispute(key, parseEther('0'))
      ).to.be.revertedWith('Dispute amount must be greater than 0');
    });

    it('Should revert because the dispute amount is greater than the rental amount', async () => {
      const { treasurer, key, owner, otherAccount } = await loadFixture(
        deployTreasurerAndStakingContractWithOngoingRental
      );

      await expect(
        treasurer.raiseDispute(key, parseEther('1.5'))
      ).to.be.revertedWith('Dispute amount exceeds rental amount');
    });

    it('Should raise the dispute as owner', async () => {
      const { treasurer, key, owner, otherAccount } = await loadFixture(
        deployTreasurerAndStakingContractWithOngoingRental
      );

      await expect(treasurer.raiseDispute(key, parseEther('0.5')))
        .to.emit(treasurer, 'Dispute')
        .withArgs(key, parseEther('0.5'));
    });

    it('Should raise the dispute as system', async () => {
      const { treasurer, key, owner, otherAccount } = await loadFixture(
        deployTreasurerAndStakingContractWithOngoingRental
      );

      await treasurer.setSystem(otherAccount.address);

      await expect(
        treasurer.connect(otherAccount).raiseDispute(key, parseEther('0.5'))
      )
        .to.emit(treasurer, 'Dispute')
        .withArgs(key, parseEther('0.5'));
    });
  });

  describe('Set Rental Info', function () {
    it('Should revert because we are neither system nor owner', async function () {
      const { treasurer, otherAccount } = await loadFixture(deployTreasurer);

      await expect(
        treasurer
          .connect(otherAccount)
          .setRentalInfo(
            ethers.encodeBytes32String('1234'),
            otherAccount.address,
            0
          )
      ).to.be.revertedWith('Only system can call this function.');
    });

    it('Should set the rental info', async function () {
      const { treasurer, owner, otherAccount } = await loadFixture(
        deployTreasurer
      );
      const rentalEndTime = new Date().getTime() + 1000;

      await treasurer.deposit(ethers.encodeBytes32String('1234'), {
        value: parseEther('1'),
      });

      const tx = await treasurer.setRentalInfo(
        ethers.encodeBytes32String('1234'),
        otherAccount.address,
        rentalEndTime
      );

      const [
        renter,
        lender,
        pendingAmount,
        totalAmount,
        pendingDisputeAmount,
        totalDisputeAmount,
        startTime,
        endTime,
        ended,
        active,
      ] = await treasurer.rentals(ethers.encodeBytes32String('1234'));

      expect(renter).to.equal(owner.address);
      expect(pendingAmount).to.equal(parseEther('1'));
      expect(active).to.equal(true);
      expect(ended).to.equal(false);
      expect(pendingDisputeAmount).to.equal(0);
      expect(endTime).to.equal(rentalEndTime);
      expect(lender).to.equal(otherAccount.address);
    });
  });
});
