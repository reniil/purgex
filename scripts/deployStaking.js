import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// Load environment
import { config } from 'dotenv';
config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.PULSECHAIN_RPC || 'https://rpc.pulsechain.com';
const PRGX_ADDRESS = process.env.PRGX_ADDRESS;
const REWARD_TOKEN_ADDRESS = process.env.REWARD_TOKEN_ADDRESS; // e.g., USDC, DAI, or PRGX itself
const REWARD_RATE_PER_SECOND = process.env.REWARD_RATE_PER_SECOND || '1000000000000000'; // 1 token per second (adjust decimals)

if (!PRIVATE_KEY || !PRGX_ADDRESS || !REWARD_TOKEN_ADDRESS) {
  console.error('Missing environment variables: PRIVATE_KEY, PRGX_ADDRESS, REWARD_TOKEN_ADDRESS');
  process.exit(1);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Deploying PRGX Staking contract...');
  console.log('Wallet:', wallet.address);
  console.log('Network:', await provider.getNetwork());

  // Load PRGXStaking artifact
  const artifactPath = path.join(process.cwd(), 'artifacts', 'contracts', 'PRGXStaking.sol', 'PRGXStaking.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  // Deploy
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const stakingToken = new ethers.Contract(PRGX_ADDRESS, [
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)'
  ], provider);

  // Check PRGX balance
  const prgxBalance = await stakingToken.balanceOf(wallet.address);
  console.log('PRGX Balance:', ethers.formatUnits(prgxBalance, 18));

  // Deploy contract
  console.log('\nDeploying contract...');
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('✅ PRGXStaking deployed to:', address);

  // Save deployment info
  const deployments = {
    stakingAddress: address,
    deployedAt: new Date().toISOString(),
    wallet: wallet.address,
    prgxToken: PRGX_ADDRESS,
    rewardToken: REWARD_TOKEN_ADDRESS,
    rewardRatePerSecond: REWARD_RATE_PER_SECOND
  };

  fs.writeFileSync(
    path.join(process.cwd(), 'deployments', 'staking.json'),
    JSON.stringify(deployments, null, 2)
  );
  console.log('📁 Deployment info saved to deployments/staking.json');

  // Configure reward token and rate
  console.log('\nConfiguring reward token and rate...');
  const tx = await contract.configureReward(
    REWARD_TOKEN_ADDRESS,
    REWARD_RATE_PER_SECOND
  );
  await tx.wait();
  console.log('✅ Reward token configured:', REWARD_TOKEN_ADDRESS);
  console.log('✅ Reward rate:', ethers.formatUnits(REWARD_RATE_PER_SECOND, 18), 'tokens/second');

  return contract;
}

main()
  .then(() => {
    console.log('\n✅ Deployment complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });