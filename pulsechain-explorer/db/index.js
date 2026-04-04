import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'data', 'explorer.db');
const db = new Database(dbPath);

// Ensure WAL mode for better performance
db.pragma('journal_mode = WAL');

// Prepare statements for performance
const statements = {
  // Token operations
  upsertToken: db.prepare(`
    INSERT INTO tokens (address, symbol, name, decimals, logoURI, source, verified, updatedAt)
    VALUES (@address, @symbol, @name, @decimals, @logoURI, @source, @verified, CURRENT_TIMESTAMP)
    ON CONFLICT(address) DO UPDATE SET
      symbol = excluded.symbol,
      name = excluded.name,
      decimals = excluded.decimals,
      logoURI = excluded.logoURI,
      source = excluded.source,
      verified = excluded.verified,
      updatedAt = CURRENT_TIMESTAMP
  `),

  getToken: db.prepare('SELECT * FROM tokens WHERE address = ?'),

  getAllTokens: db.prepare(`
    SELECT * FROM tokens
    WHERE (@verified IS NULL OR verified = @verified)
    ORDER BY symbol COLLATE NOCASE ASC
  `),

  getTokenBySymbol: db.prepare('SELECT * FROM tokens WHERE symbol = ? COLLATE NOCASE'),

  // Pair operations
  upsertPair: db.prepare(`
    INSERT INTO pairs (address, token0, token1, dex, reserve0, reserve1, reserveUpdatedAt, tvl, source, updatedAt)
    VALUES (@address, @token0, @token1, @dex, @reserve0, @reserve1, @reserveUpdatedAt, @tvl, @source, CURRENT_TIMESTAMP)
    ON CONFLICT(address) DO UPDATE SET
      token0 = excluded.token0,
      token1 = excluded.token1,
      dex = excluded.dex,
      reserve0 = excluded.reserve0,
      reserve1 = excluded.reserve1,
      reserveUpdatedAt = excluded.reserveUpdatedAt,
      tvl = excluded.tvl,
      source = excluded.source,
      updatedAt = CURRENT_TIMESTAMP
  `),

  getPair: db.prepare('SELECT * FROM pairs WHERE address = ?'),

  getAllPairs: db.prepare(`
    SELECT p.*,
           t0.symbol as token0Symbol, t0.name as token0Name, t0.logoURI as token0Logo,
           t1.symbol as token1Symbol, t1.name as token1Name, t1.logoURI as token1Logo
    FROM pairs p
    LEFT JOIN tokens t0 ON p.token0 = t0.address
    LEFT JOIN tokens t1 ON p.token1 = t1.address
    WHERE (@dex IS NULL OR p.dex = @dex)
    ORDER BY p.tvl DESC NULLS LAST
  `),

  getPairsByToken: db.prepare(`
    SELECT p.*,
           t0.symbol as token0Symbol, t0.name as token0Name,
           t1.symbol as token1Symbol, t1.name as token1Name
    FROM pairs p
    LEFT JOIN tokens t0 ON p.token0 = t0.address
    LEFT JOIN tokens t1 ON p.token1 = t1.address
    WHERE (p.token0 = ? OR p.token1 = ?)
  `),

  // Scan log
  insertScanLog: db.prepare(`
    INSERT INTO scan_log (startedAt) VALUES (CURRENT_TIMESTAMP)
  `),

  updateScanLog: db.prepare(`
    UPDATE scan_log
    SET completedAt = CURRENT_TIMESTAMP,
        pairsFound = @pairsFound,
        tokensFound = @tokensFound,
        error = @error
    WHERE id = @id
  `),

  getLastScan: db.prepare('SELECT * FROM scan_log ORDER BY id DESC LIMIT 1')
};

// Enrich token with verification status from pulsetokens.org if available
function enrichToken(token, verifiedSet = null) {
  return {
    ...token,
    verified: verifiedSet ? verifiedSet.has(token.address.toLowerCase()) : token.verified
  };
}

// Export db for raw queries if needed
export { db };

// Export API
export const tokenDAO = {
  upsert: (token) => {
    statements.upsertToken.run({
      ...token,
      address: token.address.toLowerCase(),
      verified: token.verified || false
    });
  },

  get: (address) => {
    const row = statements.getToken.get(address.toLowerCase());
    return row ? enrichToken(row) : null;
  },

  getAll: (verifiedOnly = null) => {
    const rows = statements.getAllTokens.all({ verified: verifiedOnly });
    return rows.map(enrichToken);
  },

  getBySymbol: (symbol) => {
    const row = statements.getTokenBySymbol.get(symbol);
    return row ? enrichToken(row) : null;
  }
};

export const pairDAO = {
  upsert: (pair) => {
    statements.upsertPair.run({
      ...pair,
      address: pair.address.toLowerCase(),
      token0: pair.token0.toLowerCase(),
      token1: pair.token1.toLowerCase()
    });
  },

  get: (address) => {
    return statements.getPair.get(address.toLowerCase());
  },

  getAll: (dex = null) => {
    const rows = statements.getAllPairs.all({ dex: dex || null });
    return rows.map(row => ({
      ...row,
      token0: row.token0.toLowerCase(),
      token1: row.token1.toLowerCase()
    }));
  },

  getByToken: (tokenAddress) => {
    const rows = statements.getPairsByToken.all(tokenAddress.toLowerCase(), tokenAddress.toLowerCase());
    return rows;
  }
};

export const scanLogDAO = {
  start: () => {
    const result = statements.insertScanLog.run();
    return result.lastInsertRowid;
  },

  complete: (id, pairsFound, tokensFound, error = null) => {
    statements.updateScanLog.run({
      id,
      pairsFound,
      tokensFound,
      error
    });
  },

  getLast: () => {
    return statements.getLastScan.get();
  }
};

// Cleanup on process exit
process.on('exit', () => {
  db.close();
});