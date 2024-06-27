import { ethers } from 'hardhat';

async function main() {
  const treasurer = await ethers.getContractAt(
    'NodeTreasurer',
    '0x53B2b456724D7FB25273E11163605e0Ca0b81F9f'
  );

  await treasurer.setStakingContract(
    '0xba13Fa151Eee4EaB294eD62Eb1e275D9A376367b'
  );

  console.log(`Treasurer system set`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
