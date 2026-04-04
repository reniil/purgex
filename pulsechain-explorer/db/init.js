import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'data', 'explorer.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    address TEXT PRIMARY KEY,
    symbol TEXT,
    name TEXT,
    decimals INTEGER,
    logoURI TEXT,
    source TEXT,
    verified BOOLEAN DEFAULT 0,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pairs (
    address TEXT PRIMARY KEY,
    token0 TEXT,
    token1 TEXT,
    dex TEXT,
    reserve0 TEXT,
    reserve1 TEXT,
    reserveUpdatedAt INTEGER,
    tvl REAL,
    source TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (token0) REFERENCES tokens(address),
    FOREIGN KEY (token1) REFERENCES tokens(address)
  );

  CREATE TABLE IF NOT EXISTS scan_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completedAt TIMESTAMP,
    pairsFound INTEGER DEFAULT 0,
    tokensFound INTEGER DEFAULT 0,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);
  CREATE INDEX IF NOT EXISTS idx_tokens_verified ON tokens(verified);
  CREATE INDEX IF NOT EXISTS idx_pairs_dex ON pairs(dex);
  CREATE INDEX IF NOT EXISTS idx_pairs_token0 ON pairs(token0);
  CREATE INDEX IF NOT EXISTS idx_pairs_token1 ON pairs(token1);
`);

console.log('Database initialized at:', dbPath);
console.log('Tables created successfully');

db.close();