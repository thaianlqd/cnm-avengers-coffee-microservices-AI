const { execSync } = require('child_process');
const fs = require('fs');
try {
  const stdout = execSync('docker logs avengers_api_gateway --tail 50');
  fs.writeFileSync('C:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\gateway_logs.txt', stdout);
} catch (e) {
  fs.writeFileSync('C:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\gateway_logs.txt', e.message + '\n' + (e.stdout ? e.stdout.toString() : ''));
}
try {
  const stdout2 = execSync('docker logs avengers_menu_service --tail 50');
  fs.writeFileSync('C:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\menu_logs.txt', stdout2);
} catch (e) {
  fs.writeFileSync('C:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\menu_logs.txt', e.message + '\n' + (e.stdout ? e.stdout.toString() : ''));
}
