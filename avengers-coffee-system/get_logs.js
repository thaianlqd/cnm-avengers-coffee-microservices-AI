const { execSync } = require('child_process');
const fs = require('fs');
try {
  const stdout = execSync('docker logs --tail 100 avengers_order_service');
  fs.writeFileSync('c:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\docker_logs.txt', stdout);
} catch (e) {
  fs.writeFileSync('c:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\docker_logs.txt', e.toString() + '\n' + (e.stdout ? e.stdout.toString() : '') + '\n' + (e.stderr ? e.stderr.toString() : ''));
}
