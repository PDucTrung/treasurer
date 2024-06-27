import { ethers } from 'hardhat';

async function main() {
  const treasurer = await ethers.getContractAt(
    'NodeTreasurer',
    '0x59f6bb3105894e7e9264268eafDf34fb634EA5d8'
  );

  await treasurer.setSystem('0x13CDa886c7a982c35Bb9B2b47E16b77df02d2440');
  await treasurer.setStakingContract(
    '0x8c6cF3cfA47dF6013b7063aaE807Cb1801D323fB'
  );

  console.log(`Treasurer system set`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
