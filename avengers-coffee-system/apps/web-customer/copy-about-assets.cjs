const fs = require('fs');
const path = require('path');

const srcDir = 'c:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\Về Highlands Coffee_files';
const destDir = 'c:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\apps\\web-customer\\public\\hc-assets';

const filesToCopy = [
  'ABOUT-CAREER3.jpg',
  'HLC___ngang_social_1920_x_1280_px_1_1.png',
  '8W1A6722_1.jpg'
];

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

filesToCopy.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  
  try {
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${file}`);
    } else {
      console.error(`File not found: ${srcPath}`);
    }
  } catch (error) {
    console.error(`Error copying ${file}:`, error);
  }
});

console.log('All done!');
