import { ethers, upgrades } from 'hardhat';

async function main() {
  const systemAddress = '0xce0dfa855f604d19ccb9803a8cfa2b27e83a5f0c';
  const stakingAddress = '0xF4dA885744b6f3107CE13d2d30383dCe2eeA6C85';

  const Credits = await ethers.getContractFactory('NodeCredits');
  const credits = await upgrades.deployProxy(Credits, [
    systemAddress,
    stakingAddress,
  ]);
  await credits.waitForDeployment();

  console.log(`Credits deployed to ${credits.target}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
