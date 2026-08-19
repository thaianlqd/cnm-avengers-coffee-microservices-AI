const { execSync } = require('child_process');
const fs = require('fs');
try {
  const stdout = execSync('docker ps');
  fs.writeFileSync('C:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\docker_ps.txt', stdout);
} catch (e) {}
