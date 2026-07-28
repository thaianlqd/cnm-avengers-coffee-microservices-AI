const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('docker logs avengers_order_service --tail 50').toString();
  fs.writeFileSync('docker_logs_output.txt', output);
  console.log('Logs saved');
} catch (e) {
  fs.writeFileSync('docker_logs_output.txt', e.stderr ? e.stderr.toString() : e.message);
  console.log('Error saved');
}
