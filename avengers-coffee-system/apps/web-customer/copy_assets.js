import fs from 'fs';
import path from 'path';

const srcDir = 'c:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\Highlands Coffee®_files';
const destDir = 'c:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\apps\\web-customer\\public\\hc-assets';

const files = fs.readdirSync(srcDir);
for (const file of files) {
  if (file.endsWith('.png') || file.endsWith('.jpg')) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}
console.log('Images copied successfully!');
