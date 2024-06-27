import { ethers } from 'hardhat';

async function main() {
  // const gpuToken = await ethers.deployContract('GPUToken', []);
  // await gpuToken.waitForDeployment();

  // const treasurer = await ethers.deployContract('NodeTreasurer', []);
  // await treasurer.waitForDeployment();

  const gpuTokenAddress = "0x1258D60B224c0C5cD888D37bbF31aa5FCFb7e870"

  const staking = await ethers.deployContract('NodeStaking', [gpuTokenAddress]);
  await staking.waitForDeployment();

  // console.log(`GPU deployed to ${gpuToken.target}`);
  // console.log(`Treasurer deployed to ${treasurer.target}`);
  console.log(`Staking deployed to ${staking.target}`);

  await staking.setMaxPerWallet(ethers.parseUnits('50000', 18));
  await staking.setMaxTotalStaked(ethers.parseUnits('10000000', 18));

  // await treasurer.setSystem('0x13CDa886c7a982c35Bb9B2b47E16b77df02d2440');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
