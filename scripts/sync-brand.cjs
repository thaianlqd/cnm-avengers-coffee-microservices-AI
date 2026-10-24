// Canonical SVG artwork is copied unchanged; only its fill changes for dark surfaces.
// PNG equivalents serve React Native Image, which does not decode SVG on iOS/Android.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const brand = path.join(root, 'avengers-coffee-system/assets/branding');
const black = fs.readFileSync(path.join(brand, 'logo.svg'), 'utf8');
const white = black.replace(/#000000/gi, '#ffffff');
fs.writeFileSync(path.join(brand, 'logo-white.svg'), white);
const webApps = ['web-admin','web-customer','web-shipper','web-table-order','shipper-launcher','customer-mobile','shipper-mobile','admin-mobile'];
for (const app of webApps) {
  const publicDir = path.join(root, 'avengers-coffee-system/apps', app, 'public');
  const dest = path.join(publicDir, 'images/brand');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'logo.svg'), black);
  fs.writeFileSync(path.join(dest, 'logo-white.svg'), white);
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), black);
}
const analytics = path.join(root, 'data-platform/web-ui/public/images/brand');
fs.mkdirSync(analytics, { recursive:true });
fs.writeFileSync(path.join(analytics,'logo.svg'), black);
fs.writeFileSync(path.join(analytics,'logo-white.svg'), white);
async function nativeAssets() {
  const sharp = require('sharp');
  for (const app of ['customer-mobile','shipper-mobile','admin-mobile']) {
    const dest = path.join(root,'avengers-coffee-system/apps',app,'assets/branding');
    fs.mkdirSync(dest,{recursive:true});
    fs.writeFileSync(path.join(dest,'logo.svg'),black);
    fs.writeFileSync(path.join(dest,'logo-white.svg'),white);
    for (const [name,svg] of [['logo',black],['logo-black',black],['logo-red',black],['logo-white',white],['splash-logo',white]]) {
      await sharp(Buffer.from(svg)).resize({width:1024}).png().toFile(path.join(dest,name+'.png'));
    }
    await sharp(Buffer.from(white)).resize({width:1024}).png().toFile(path.join(root,'avengers-coffee-system/apps',app,'public/splash-logo.png'));
  }
}
nativeAssets().then(()=>console.log('Brand SVGs and native PNGs synchronized.')).catch(error=>{console.error(error.message);process.exit(1)});
