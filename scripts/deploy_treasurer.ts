import { ethers } from 'hardhat';

async function main() {
  const stakingAddress = '0xF4dA885744b6f3107CE13d2d30383dCe2eeA6C85';
  const systemAddress = '0xcE0DFA855F604d19ccb9803A8cfA2b27E83A5f0c';

  const treasurer = await ethers.deployContract('NodeTreasurer');
  await treasurer.waitForDeployment();

  console.log(`Treasurer deployed to ${treasurer.target}`);

  await treasurer.setRevenueSharePercentage(25);
  await treasurer.setSystem(systemAddress);
  // await treasurer.setStakingContract(stakingAddress);

  console.log('Treasurer settings set');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
