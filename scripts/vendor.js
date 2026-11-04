// Copies the Firebase browser files into www/vendor so the app does not need a CDN.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'www', 'vendor');
fs.mkdirSync(outDir, { recursive: true });

const files = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'];
for (const f of files) {
  const src = path.join(root, 'node_modules', 'firebase', f);
  if (!fs.existsSync(src)) {
    console.error('Missing ' + src + '. Run "npm install" first.');
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(outDir, f));
  console.log('copied ' + f);
}
