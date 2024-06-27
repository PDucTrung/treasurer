import { expect } from 'chai';
import { ethers } from 'hardhat';
import { parseEther, Signer } from 'ethers';
import { NodeCredits } from '../typechain-types';

const parseCredits = (credits: number) => {
  return parseEther(credits.toString());
};

describe.only('NodeCredits', function () {
  let nodeCredits: NodeCredits;
  let address: string;

  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let addr3: Signer;
  let addr4: Signer;
  let addr5: Signer;

  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    owner = accounts[0];
    addr1 = accounts[1];
    addr2 = accounts[2];
    addr3 = accounts[3];
    addr4 = accounts[4];
    addr5 = accounts[5];

    const NodeCreditsContract = await ethers.getContractFactory('NodeCredits');
    nodeCredits = (await NodeCreditsContract.deploy(
      await addr1.getAddress()
    )) as NodeCredits;

    address = await nodeCredits.getAddress();
  });

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      expect(await nodeCredits.owner()).to.equal(await owner.getAddress());
    });

    it('Should set the right system account', async function () {
      expect(await nodeCredits.systemAccount()).to.equal(
        await addr1.getAddress()
      );
    });
  });

  describe('Exchange Rate', function () {
    it('Should return the correct exchange rate', async function () {
      expect(await nodeCredits.getExchangeRate()).to.equal(100000);
    });
  });

  describe('Deposits', function () {
    it('Should allow users to deposit ETH and update balances correctly', async function () {
      const depositAmount = parseEther('1');
      await nodeCredits.connect(addr2).deposit({
        value: depositAmount,
      });

      expect(await nodeCredits.balances(await addr2.getAddress())).to.equal(
        depositAmount * 100000n
      );
    });

    it('Should emit a BalanceUpdated event on deposit', async function () {
      const depositAmount = parseEther('1');
      await expect(
        nodeCredits.connect(addr2).deposit({
          value: depositAmount,
        })
      )
        .to.emit(nodeCredits, 'BalanceUpdated')
        .withArgs(await addr2.getAddress(), depositAmount * 100000n, 0);
    });
  });

  describe('Withdrawals', function () {
    it('Should allow withdrawals and update balances correctly', async function () {
      const depositAmount = parseEther('1');
      await nodeCredits.connect(addr2).deposit({
        value: depositAmount,
      });
      await nodeCredits.connect(addr2).withdraw(depositAmount * 100000n);
      expect(await nodeCredits.balances(await addr2.getAddress())).to.equal(0);
    });

    it('Should revert withdrawals when insufficient balance', async function () {
      const depositAmount = parseEther('1');
      await nodeCredits.connect(addr2).deposit({
        value: depositAmount,
      });
      await expect(
        nodeCredits.connect(addr2).withdraw(depositAmount * 200000n)
      ).to.be.revertedWith('Insufficient allowance');
    });
  });

  describe('Reserving Credits', function () {
    it('Should allow system account to reserve credits', async function () {
      const depositAmount = parseEther('1');
      await nodeCredits.connect(addr2).deposit({
        value: depositAmount,
      });

      await nodeCredits
        .connect(addr1)
        .reserveCredits(await addr2.getAddress(), depositAmount * 50000n);
      expect(await nodeCredits.reserves(await addr2.getAddress())).to.equal(
        depositAmount * 50000n
      );
    });

    it('Should revert reserving credits if not system account', async function () {
      await expect(
        nodeCredits
          .connect(addr2)
          .reserveCredits(await addr2.getAddress(), 1000)
      ).to.be.revertedWith('Unauthorized: caller is not the system account');
    });
  });

  describe('Credit Transfers', function () {
    it('System can transfer reserved credits', async function () {
      const depositAmount = parseEther('1');
      await nodeCredits.connect(addr4).deposit({
        value: depositAmount,
      });

      await nodeCredits
        .connect(addr1)
        .reserveCredits(await addr4.getAddress(), depositAmount * 100_000n);
      await nodeCredits
        .connect(addr1)
        .transferCreditsFromReserve(
          await addr4.getAddress(),
          await addr5.getAddress(),
          depositAmount * 50_000n,
          0
        );
      expect(await nodeCredits.balances(await addr5.getAddress())).to.equal(
        depositAmount * 50_000n
      );
    });

    it('Should return the available balance', async function () {
      const depositAmount = parseEther('1');
      await nodeCredits.connect(addr2).deposit({
        value: depositAmount,
      });

      expect(
        await nodeCredits.getAvailableBalance(await addr2.getAddress())
      ).to.equal(depositAmount * 100000n);
    });

    it('Should return the available balance', async function () {
      const depositAmount = parseEther('1');
      await nodeCredits.connect(addr2).deposit({
        value: depositAmount,
      });

      await nodeCredits
        .connect(addr1)
        .reserveCredits(await addr2.getAddress(), depositAmount * 100000n);
      await nodeCredits
        .connect(addr1)
        .transferCreditsFromReserve(
          await addr2.getAddress(),
          await addr3.getAddress(),
          depositAmount * 50000n,
          0
        );
      expect(
        await nodeCredits.getAvailableBalance(await addr3.getAddress())
      ).to.equal(depositAmount * 50000n);
    });

    it.only('System can transfer reserved credits with dispute amount', async function () {
      const depositAmount = parseEther('1');
      await nodeCredits.connect(addr4).deposit({
        value: depositAmount,
      });

      const balanceBefore = await nodeCredits.getAvailableBalance(
        await addr4.getAddress()
      );
      console.log('balanceBefore', balanceBefore.toString());

      // reserve full deposit amount
      await nodeCredits
        .connect(addr1)
        .reserveCredits(await addr4.getAddress(), parseCredits(100_000));

      const balanceAfterReserve = await nodeCredits.getAvailableBalance(
        await addr4.getAddress()
      );
      console.log('balanceAfterReserve', balanceAfterReserve.toString());

      await nodeCredits
        .connect(addr1)
        .transferCreditsFromReserve(
          await addr4.getAddress(),
          await addr5.getAddress(),
          parseCredits(90_000),
          10_000
        );
      expect(await nodeCredits.balances(await addr5.getAddress())).to.equal(
        parseCredits(90_000)
      );
      expect(await nodeCredits.balances(await addr4.getAddress())).to.equal(
        parseCredits(10_000)
      );
    });
  });

  describe('Migrate Funds', function () {
    it('Owner can withdraw all funds', async function () {
      const depositAmount = parseEther('1');
      await nodeCredits.connect(addr2).deposit({
        value: depositAmount,
      });

      const balanceBefore = await ethers.provider.getBalance(owner);
      await nodeCredits.connect(owner).migrateFunds();
      const balanceAfter = await ethers.provider.getBalance(owner);
      expect(balanceAfter).to.be.above(balanceBefore);
    });

    it('Should revert migration attempt by non-owner', async function () {
      await expect(
        nodeCredits.connect(addr2).migrateFunds()
      ).to.be.revertedWithCustomError(
        nodeCredits,
        'OwnableUnauthorizedAccount'
      );
    });
  });

  describe('Funds Migration Event', function () {
    it('Should emit FundsMigrated event on fund migration', async function () {
      await expect(nodeCredits.connect(owner).migrateFunds()).to.emit(
        nodeCredits,
        'FundsMigrated'
      );
    });
  });
});
