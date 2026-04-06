#!/usr/bin/env node
/**
 * Token Discovery Core Utilities Unit Tests
 * Run with: node test/test-tokens.js
 * 
 * Tests core utility functions used by the TokenDiscovery module
 */

const { ethers } = require('ethers');

// Test utilities
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runTests() {
  console.log('🧪 Token Discovery Core Utilities Test\n');
  console.log('=' .repeat(50));
  
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✅ ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${t.name}`);
      console.log(`   Error: ${err.message}`);
      failed++;
    }
  }
  
  console.log('=' .repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  process.exit(failed > 0 ? 1 : 0);
}

// Mock TokenDiscovery core methods
class MockTokenDiscovery {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000;
    this.stats = { rpcCalls: 0, cacheHits: 0, retries: 0, errors: 0 };
    this.config = {
      maxBlockRange: 10000,
      initialBatchSize: 20,
      maxBatchSize: 50,
      minBatchSize: 5,
      retryDelay: 1000,
      maxRetries: 3,
      timeout: 15000,
      deferZeroBalance: true
    };
  }

  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  setCached(key, value, ttl = this.cacheTTL) {
    this.cache.set(key, { value, expires: Date.now() + ttl });
  }

  isValidTokenAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  adjustBatchSize(currentSize, success) {
    if (success) {
      return Math.min(this.config.maxBatchSize, Math.floor(currentSize * 1.1));
    } else {
      return Math.max(this.config.minBatchSize, Math.floor(currentSize * 0.7));
    }
  }

  withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isNonRetryable(error) {
    const nonRetryable = [
      'insufficient funds',
      'invalid argument',
      'contract not found',
      'missing revert data'
    ];
    const message = error.message?.toLowerCase() || '';
    return nonRetryable.some(msg => message.includes(msg));
  }

  sortTokensByRelevance(tokens) {
    const sorted = new Map();
    const sortedEntries = Array.from(tokens.entries()).sort((a, b) => {
      const aHasBalance = a[1].balance > 0n ? 1 : 0;
      const bHasBalance = b[1].balance > 0n ? 1 : 0;
      if (aHasBalance !== bHasBalance) return bHasBalance - aHasBalance;
      const valueA = a[1].estimatedUSD || 0;
      const valueB = b[1].estimatedUSD || 0;
      if (valueA !== valueB) return valueB - valueA;
      return a[1].symbol.localeCompare(b[1].symbol);
    });
    for (const [address, token] of sortedEntries) {
      sorted.set(address, token);
    }
    return sorted;
  }

  async estimateTokenValue(address, balance, decimals) {
    try {
      const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals));
      if (balanceFormatted === 0) return { estimatedPRGX: 0, estimatedUSD: 0 };
      if (balanceFormatted < 1000) return { estimatedPRGX: 0, estimatedUSD: 0 };
      const estimatedUSD = balanceFormatted * 0.0001;
      const estimatedPRGX = estimatedUSD / 0.001;
      return {
        estimatedPRGX: Math.max(0, estimatedPRGX),
        estimatedUSD: Math.max(0, estimatedUSD)
      };
    } catch (error) {
      return { estimatedPRGX: 0, estimatedUSD: 0 };
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

// ============ TESTS ============

test('MockTokenDiscovery instance creation', () => {
  const td = new MockTokenDiscovery();
  assert(td instanceof MockTokenDiscovery, 'Should create instance');
  assert(td.cache instanceof Map, 'Should have Map for cache');
});

test('Config defaults are set correctly', () => {
  const td = new MockTokenDiscovery();
  assert(td.config.maxBlockRange === 10000);
  assert(td.config.initialBatchSize === 20);
  assert(td.config.timeout === 15000);
  assert(td.config.maxRetries === 3);
  assert(td.config.deferZeroBalance === true);
});

test('Cache operations work', () => {
  const td = new MockTokenDiscovery();
  
  td.setCached('test-key', { foo: 'bar' }, 60000);
  const value = td.getCached('test-key');
  assert(value && value.foo === 'bar', 'Should retrieve cached value');
  
  // Expired entry
  td.setCached('expired-key', { baz: 'qux' }, 1);
  setTimeout(() => {
    const expired = td.getCached('expired-key');
    assert(expired === null, 'Expired entry should return null');
  }, 2);
});

test('isValidTokenAddress validates correctly', () => {
  const td = new MockTokenDiscovery();
  
  assert(td.isValidTokenAddress('0x742d35Cc6634C0532925a3b8D4C9db96C4b4Db45'));
  assert(td.isValidTokenAddress('0x0000000000000000000000000000000000000000'));
  assert(!td.isValidTokenAddress('0x123'));
  assert(!td.isValidTokenAddress('not-an-address'));
  assert(!td.isValidTokenAddress('0xGGG'));
});

test('adjustBatchSize increases on success', () => {
  const td = new MockTokenDiscovery();
  const newSize = td.adjustBatchSize(20, true);
  assert(newSize === 22, `Expected 22 (20 * 1.1), got ${newSize}`);
  assert(newSize <= td.config.maxBatchSize);
});

test('adjustBatchSize decreases on failure', () => {
  const td = new MockTokenDiscovery();
  const newSize = td.adjustBatchSize(20, false);
  assert(newSize === 14, `Expected 14 (20 * 0.7), got ${newSize}`);
  assert(newSize >= td.config.minBatchSize);
});

test('isNonRetryable identifies non-retryable errors', () => {
  const td = new MockTokenDiscovery();
  
  assert(td.isNonRetryable(new Error('insufficient funds')));
  assert(td.isNonRetryable(new Error('invalid argument')));
  assert(td.isNonRetryable(new Error('contract not found')));
  assert(!td.isNonRetryable(new Error('timeout')));
  assert(!td.isNonRetryable(new Error('network error')));
});

test('withTimeout rejects after timeout', async () => {
  const td = new MockTokenDiscovery();
  
  const slowPromise = new Promise(resolve => setTimeout(resolve, 2000));
  const timedPromise = td.withTimeout(slowPromise, 100);
  
  try {
    await timedPromise;
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err.message.includes('Timeout'), `Expected timeout error, got: ${err.message}`);
  }
});

test('delay resolves after ms', async () => {
  const td = new MockTokenDiscovery();
  const start = Date.now();
  await td.delay(50);
  const elapsed = Date.now() - start;
  assert(elapsed >= 40 && elapsed < 150, `Delay should be ~50ms, was ${elapsed}ms`);
});

test('sortTokensByRelevance sorts correctly', () => {
  const td = new MockTokenDiscovery();
  
  const tokens = new Map([
    ['0xtoken1', { symbol: 'AAA', balance: 0n, estimatedUSD: 0 }],
    ['0xtoken2', { symbol: 'BBB', balance: ethers.parseUnits('1', 18), estimatedUSD: 1000 }],
    ['0xtoken3', { symbol: 'CCC', balance: ethers.parseUnits('0.5', 18), estimatedUSD: 500 }],
    ['0xtoken4', { symbol: 'DDD', balance: 0n, estimatedUSD: 100 }]
  ]);
  
  const sorted = td.sortTokensByRelevance(tokens);
  const sortedArray = Array.from(sorted.values());
  
  // First should have balance > 0
  assert(sortedArray[0].balance > 0n, 'First token should have balance');
  // Among balance tokens, higher value should come first
  assert(sortedArray[0].estimatedUSD >= sortedArray[1].estimatedUSD);
});

test('estimateTokenValue calculates correctly', async () => {
  const td = new MockTokenDiscovery();
  
  // Large balance
  const value1 = await td.estimateTokenValue('0xtest', ethers.parseUnits('1000', 18), 18);
  assert(value1.estimatedUSD > 0, 'Should have positive USD value');
  
  // Zero balance
  const value2 = await td.estimateTokenValue('0xtest', 0n, 18);
  assert(value2.estimatedUSD === 0 && value2.estimatedPRGX === 0);
  
  // Very small balance (dust threshold < 1000 tokens)
  const value3 = await td.estimateTokenValue('0xtest', ethers.parseUnits('500', 18), 18);
  assert(value3.estimatedUSD === 0, 'Dust balance should be zero');
});

test('clearCache empties cache', () => {
  const td = new MockTokenDiscovery();
  
  td.setCached('key1', 'value1');
  td.setCached('key2', 'value2');
  
  assert(td.cache.size === 2, 'Cache should have 2 entries');
  
  td.clearCache();
  
  assert(td.cache.size === 0, 'Cache should be empty after clear');
});

test('Cache respects TTL', async () => {
  const td = new MockTokenDiscovery();
  
  td.setCached('ttl-test', { data: 'test' }, 10);
  
  // Should be available immediately
  let value = td.getCached('ttl-test');
  assert(value !== null, 'Should be available before TTL');
  
  // Wait for expiry (need >10ms)
  await td.delay(50);
  
  value = td.getCached('ttl-test');
  assert(value === null, 'Should be null after TTL expires');
});

// Run tests
runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});