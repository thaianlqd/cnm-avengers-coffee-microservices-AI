const fs = require('fs');
const os = require('os');
const path = require('path');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Bỏ qua internal (localhost) và chỉ lấy IPv4
      if (iface.family === 'IPv4' && !iface.internal) {
        // Ưu tiên Wi-Fi hoặc Ethernet
        if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('ethernet')) {
           return iface.address;
        }
      }
    }
  }
  // Fallback
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const ip = getLocalIp();
console.log('Detected Local IP:', ip);

const filePath = path.join(__dirname, 'avengers-coffee-system', 'apps', 'shipper-mobile', 'src', 'lib', 'apiClient.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the ngrok URL with the local IP
content = content.replace(
  /const API_BASE_URL = Platform\.OS === 'web'[\s\S]*?\: 'https:\/\/unentwined-johanne-biasedly\.ngrok-free\.dev'/,
  `const API_BASE_URL = Platform.OS === 'web' \n  ? 'http://localhost:3000' \n  : 'http://${ip}:3000'`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated apiClient.js with IP:', ip);
