const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('docker exec avengers_order_service cat /app/src/modules/shipper/shipper.service.ts', { shell: 'cmd.exe' }).toString();
  fs.writeFileSync('shipper_service_in_container.ts', output);
  console.log('File saved');
} catch (e) {
  fs.writeFileSync('shipper_service_in_container.ts', e.stderr ? e.stderr.toString() : e.message);
  console.log('Error saved');
}
