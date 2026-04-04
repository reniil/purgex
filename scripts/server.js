// PurgeX Server - Frontend + Explorer API
const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, '..', 'pulsechain-explorer', 'data', 'explorer.db');

// Initialize database if exists
let db = null;
if (fs.existsSync(DB_PATH)) {
  db = new Database(DB_PATH);
  console.log('📊 Connected to PulseChain Explorer database');
} else {
  console.log('⚠️  Explorer database not found. Run: cd pulsechain-explorer && npm run db:init');
}

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

// API Response helper
const sendJSON = (res, data, status = 200) => {
  res.writeHead(status, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
};

// API Routes
const handleAPI = (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // Health check
  if (pathname === '/api/health' && method === 'GET') {
    return sendJSON(res, { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      explorer: db ? 'connected' : 'not available'
    });
  }

  // Explorer not available - fallback info
  if (!db) {
    return sendJSON(res, { 
      error: 'Explorer database not initialized',
      message: 'Run: cd pulsechain-explorer && npm run db:init && npm run scan'
    }, 503);
  }

  // GET /api/tokens
  if (pathname === '/api/tokens' && method === 'GET') {
    const verified = url.searchParams.get('verified');
    let query = 'SELECT * FROM tokens';
    const params = [];
    
    if (verified === 'true') {
      query += ' WHERE verified = 1';
    } else if (verified === 'false') {
      query += ' WHERE verified = 0';
    }
    
    query += ' ORDER BY symbol COLLATE NOCASE ASC';
    
    const tokens = db.prepare(query).all(...params);
    return sendJSON(res, { count: tokens.length, tokens });
  }

  // GET /api/tokens/:address
  if (pathname.match(/^\/api\/tokens\/0x[a-fA-F0-9]{40}$/) && method === 'GET') {
    const address = pathname.split('/')[3].toLowerCase();
    const token = db.prepare('SELECT * FROM tokens WHERE address = ?').get(address);
    if (!token) return sendJSON(res, { error: 'Token not found' }, 404);
    return sendJSON(res, token);
  }

  // GET /api/pairs
  if (pathname === '/api/pairs' && method === 'GET') {
    const dex = url.searchParams.get('dex');
    let query = `
      SELECT p.*,
             t0.symbol as token0Symbol, t0.name as token0Name, t0.logoURI as token0Logo,
             t1.symbol as token1Symbol, t1.name as token1Name, t1.logoURI as token1Logo
      FROM pairs p
      LEFT JOIN tokens t0 ON p.token0 = t0.address
      LEFT JOIN tokens t1 ON p.token1 = t1.address
    `;
    const params = [];
    
    if (dex) {
      query += ' WHERE p.dex = ?';
      params.push(dex);
    }
    
    query += ' ORDER BY p.tvl DESC NULLS LAST';
    
    const pairs = db.prepare(query).all(...params);
    return sendJSON(res, { count: pairs.length, pairs });
  }

  // GET /api/scan/status
  if (pathname === '/api/scan/status' && method === 'GET') {
    const lastScan = db.prepare('SELECT * FROM scan_log ORDER BY id DESC LIMIT 1').get();
    return sendJSON(res, lastScan || { message: 'No scans yet' });
  }

  // POST /api/scan/trigger
  if (pathname === '/api/scan/trigger' && method === 'POST') {
    // Just return status - full scan requires node scanner.js
    return sendJSON(res, { 
      message: 'Scan requires manual execution',
      command: 'cd pulsechain-explorer && npm run scan',
      lastScan: db.prepare('SELECT * FROM scan_log ORDER BY id DESC LIMIT 1').get()
    });
  }

  // 404 for unmatched API routes
  return sendJSON(res, { error: 'API endpoint not found' }, 404);
};

// Static file serving
const serveStatic = (req, res) => {
  let filePath = path.join(__dirname, '..', 'frontend', req.url === '/' ? 'index.html' : req.url);
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeType = mimeTypes[extname] || 'application/octet-stream';

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // SPA fallback
      filePath = path.join(__dirname, '..', 'frontend', 'index.html');
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>404 Not Found</h1><p>PurgeX Frontend</p>');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content, 'utf-8');
        }
      });
    } else {
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<h1>500 Internal Server Error</h1>');
        } else {
          res.writeHead(200, { 'Content-Type': mimeType });
          res.end(content, 'utf-8');
        }
      });
    }
  });
};

// Main server
const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Route to API or static files
  if (req.url.startsWith('/api/')) {
    handleAPI(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║            🚀 PurgeX Server Running                    ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Frontend: http://localhost:${PORT}                     ║`);
  console.log(`║  API:      http://localhost:${PORT}/api                 ║`);
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                            ║');
  console.log('║    GET  /api/health          - Health check           ║');
  console.log('║    GET  /api/tokens          - All tokens             ║');
  console.log('║    GET  /api/tokens/:addr    - Token details          ║');
  console.log('║    GET  /api/pairs           - All LP pairs           ║');
  console.log('║    GET  /api/scan/status     - Last scan info         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🔧 Press Ctrl+C to stop');
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  if (db) db.close();
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});
