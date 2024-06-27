import { ethers } from 'hardhat';

async function main() {
  const credits = await ethers.getContractAt(
    'NodeCredits',
    '0xeE91D48F962F494CAecB1d9b7aFb7FA2D36891EA'
  );

  const balance = await credits.getAvailableBalance(
    '0x51F0F440bD8Cc71A4f0c060aF059362dfeA07bFB'
  );

  console.log(`Balance ${balance}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
