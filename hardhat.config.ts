import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@openzeppelin/hardhat-upgrades';
import '@nomicfoundation/hardhat-verify';
import { configDotenv } from 'dotenv';

configDotenv();

const config: HardhatUserConfig = {
  solidity: '0.8.24',
  mocha: {},
  etherscan: {
    apiKey: 'Q8K3JPU44ZHH652MDW614XFQ7CRYGQYVB5',
  },
  networks: {
    local: {
      url: 'http://172.25.0.1:7545',
      chainId: 1337,
      accounts: {
        mnemonic: process.env['MNEMONIC'] || '',
      },
    },
    testnet: {
      url: 'https://rpc-testnet.nodes.ai',
      chainId: 785,
      accounts: [process.env['PASSPHRASE'] || ''],
    },
    sepolia: {
      url: 'https://eth-sepolia.g.alchemy.com/v2/s2JIpjXB0djkIi5gWpUBM6b3OjdchRav',
      chainId: 11155111,
      accounts: [process.env['PASSPHRASE'] || ''],
    },
    mainnet: {
      url: 'https://eth-mainnet.g.alchemy.com/v2/BDgQ0cOlgurMNmUYMbSs9ZmyQ8sqFpUJ',
      chainId: 1,
      accounts: [process.env['PASSPHRASE'] || ''],
    },
  },
};

export default config;
