import { ethers } from 'hardhat';

async function main() {
  const contract = await ethers.getContractAt(
    'NodeCredits',
    '0x39fD770A643E72EABAe9406A53189319A18895E0'
  );
  const exchangeRate = await contract.EXCHANGE_RATE();

  console.log(`Exchange rate is ${exchangeRate}`);

  const system = await contract.systemAccount();
  const staking = await contract.stakingContract();

  console.log(`System account is ${system}`);
  console.log(`Staking contract is ${staking}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
