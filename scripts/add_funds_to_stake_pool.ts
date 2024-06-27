import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();

  const staking = await ethers.getContractAt(
    'NodeStaking',
    '0x7854AE6d1718578D4c5a986ff03518bD6930eCBc'
  );

  const balance = await ethers.provider.getBalance(await staking.getAddress());

  console.log('Balance:', ethers.formatEther(balance));
  await deployer.sendTransaction({
    to: await staking.getAddress(),
    value: ethers.parseEther('5'),
  });

  console.log('Funds added to staking pool');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
