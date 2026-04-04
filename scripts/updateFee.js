import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.PULSECHAIN_RPC || 'https://rpc.pulsechain.com';
const SWEEPER_ADDRESS = '0xc6735B24D5A082E0A75637179A76ecE8a1aE1575';
const NEW_FEE_BPS = 500; // 5%

if (!PRIVATE_KEY) {
  console.error('Missing PRIVATE_KEY in environment');
  process.exit(1);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Updating PurgeX sweeper fee...');
  console.log('Wallet:', wallet.address);
  console.log('Sweeper:', SWEEPER_ADDRESS);
  console.log('New fee:', NEW_FEE_BPS, 'BPS (', (NEW_FEE_BPS / 100).toFixed(2), '% )');

  // Check current owner
  const sweeper = new ethers.Contract(SWEEPER_ADDRESS, [
    'function owner() view returns (address)',
    'function protocolFeeBps() view returns (uint256)',
    'function setProtocolFee(uint256 bps) external'
  ], provider);

  const currentOwner = await sweeper.owner();
  console.log('Current owner:', currentOwner);
  console.log('Your address:', wallet.address);

  if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error('❌ You are NOT the owner of the sweeper contract!');
    console.error('   Only the owner can update the fee.');
    process.exit(1);
  }

  const currentFee = await sweeper.protocolFeeBPS();
  console.log('Current fee:', currentFee.toNumber(), 'BPS (', (currentFee.toNumber() / 100).toFixed(2), '% )');

  // Execute fee update
  console.log('\n📝 Updating fee...');
  const tx = await sweeper.setProtocolFee(NEW_FEE_BPS);
  console.log('Transaction sent:', tx.hash);
  console.log('Waiting for confirmation...');

  const receipt = await tx.wait();
  console.log('✅ Transaction confirmed in block:', receipt.blockNumber);

  // Verify
  const newFee = await sweeper.protocolFeeBPS();
  console.log('✅ New fee set:', newFee.toNumber(), 'BPS (', (newFee.toNumber() / 100).toFixed(2), '% )');

  console.log('\n🎉 Fee update complete!');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});