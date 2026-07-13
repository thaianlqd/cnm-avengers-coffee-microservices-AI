const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', '..', 'Highlands Coffee®_files');
const destDir = path.join(__dirname, 'public', 'hc-assets');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.readdirSync(srcDir).forEach(file => {
  if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.svg') || file.endsWith('.gif')) {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);
    fs.copyFileSync(srcFile, destFile);
    console.log(`Copied ${file}`);
  }
});
console.log('Done copying order assets!');
