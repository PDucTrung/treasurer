import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();

  const staking = await ethers.getContractAt(
    'NodeStaking',
    '0x7854AE6d1718578D4c5a986ff03518bD6930eCBc'
  );
  //

  const tx = await staking.setMaxTotalStaked(ethers.parseUnits('5000000', 18));
  await tx.wait();
  const tx2 = await staking.setMaxPerWallet(ethers.parseUnits('50000', 18));
  await tx2.wait();

  console.log('Funds added to staking pool');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
