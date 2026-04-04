require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    pulsechain: {
      chainId: 369,
      url: process.env.RPC_URL || 'https://rpc.pulsechain.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 2000000000, // 2 gwei (2,000,000,000 wei) - reasonable gas price
      confirmations: 1,
      nonce: undefined // Let ethers handle nonce automatically
    }
  },
  etherscan: {
    apiKey: {
      pulsechain: 'pulsechain' // PulseXScan works with Etherscan-style API
    }
  },
  gasReporter: {
    enabled: false
  }
};
