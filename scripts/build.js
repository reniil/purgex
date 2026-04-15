const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Clean dist directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// Copy files and add hash for cache busting
const copyWithHash = (src, dest) => {
  const content = fs.readFileSync(src);
  const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
  const ext = path.extname(src);
  const basename = path.basename(src, ext);
  const hashedFilename = `${basename}.${hash}${ext}`;
  const hashedPath = path.join(path.dirname(dest), hashedFilename);

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(hashedPath, content);

  return hashedFilename;
};

// Copy directories recursively
const copyDir = (src, dest, fileMap = {}) => {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip dist folder and build artifacts
    if (entry.name === 'dist' || entry.name.endsWith('.zip') || entry.name === 'node_modules') {
      continue;
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, fileMap);
    } else {
      // Add hash to JS and CSS files for cache busting
      if (entry.name.match(/\.(js|css)$/)) {
        const hashedFilename = copyWithHash(srcPath, destPath);
        fileMap[entry.name] = hashedFilename;
      } else {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  return fileMap;
};

console.log('Building frontend...');
const fileMap = copyDir(FRONTEND_DIR, DIST_DIR);

// Update HTML file to reference hashed files
const htmlPath = path.join(DIST_DIR, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf-8');

for (const [original, hashed] of Object.entries(fileMap)) {
  html = html.replace(`src="js/${original}"`, `src="js/${hashed}"`);
  html = html.replace(`href="css/${original}"`, `href="css/${hashed}"`);
}

fs.writeFileSync(htmlPath, html);

console.log('Build complete! Output:', DIST_DIR);
console.log('Files with hashes:', Object.keys(fileMap).length);
