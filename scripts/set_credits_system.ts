import { ethers } from 'hardhat';

async function main() {
  const systemAddress = '0xc52f3d95bEC0004d63046fe82ad4e0Bb9Ab7a375';
  const creditsAddress = '0x1BE3241cb6aEABECC0aBa6FA2AAfF88c7682b9e3';

  const credits = await ethers.getContractAt('NodeCredits', creditsAddress);
  await credits.setSystemAccount(systemAddress);

  console.log(`Credits system changed to ${credits.target}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
