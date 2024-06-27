import { ethers } from 'hardhat';

async function main() {
  const [deployer, user1, user2, user3, user4, user5, user6] =
    await ethers.getSigners();

  const staking = await ethers.getContractAt(
    'NodeStaking',
    '0xba13Fa151Eee4EaB294eD62Eb1e275D9A376367b'
  );

  const token = await ethers.getContractAt(
    'GPUToken',
    '0xfF9Cb9C915a2cbB06757d12a24442B0B520b54ca'
  );

  // await token
  //   .connect(deployer)
  //   .transfer(user1.address, ethers.parseUnits('50000', 18));
  await token
    .connect(deployer)
    .transfer(user2.address, ethers.parseUnits('50000', 18));
  await token
    .connect(deployer)
    .transfer(user3.address, ethers.parseUnits('50000', 18));
  await token
    .connect(deployer)
    .transfer(user4.address, ethers.parseUnits('50000', 18));
  await token
    .connect(deployer)
    .transfer(user5.address, ethers.parseUnits('50000', 18));
  await token
    .connect(deployer)
    .transfer(user6.address, ethers.parseUnits('50000', 18));
  //
  // await token
  //   .connect(user1)
  //   .approve(staking.target, ethers.parseUnits('50000', 18));
  await token
    .connect(user2)
    .approve(staking.target, ethers.parseUnits('50000', 18));
  await token
    .connect(user3)
    .approve(staking.target, ethers.parseUnits('50000', 18));
  await token
    .connect(user4)
    .approve(staking.target, ethers.parseUnits('50000', 18));
  await token
    .connect(user5)
    .approve(staking.target, ethers.parseUnits('50000', 18));
  await token
    .connect(user6)
    .approve(staking.target, ethers.parseUnits('50000', 18));

  // await staking.connect(user1).stake(ethers.parseUnits('50000', 18));
  await staking.connect(user2).stake(ethers.parseUnits('50000', 18));
  await staking.connect(user3).stake(ethers.parseUnits('50000', 18));
  await staking.connect(user4).stake(ethers.parseUnits('50000', 18));
  await staking.connect(user5).stake(ethers.parseUnits('50000', 18));
  await staking.connect(user6).stake(ethers.parseUnits('50000', 18));

  console.log('Token staked');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
