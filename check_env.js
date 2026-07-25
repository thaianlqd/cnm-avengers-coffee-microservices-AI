const fs = require('fs');
const env = fs.readFileSync('c:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\.env', 'utf8');
const lines = env.split('\n');
for (const line of lines) {
    if (line.includes('VNPAY_HASH_SECRET')) {
        console.log("Found line:", line);
        const val = line.split('=')[1];
        if (val) {
            console.log("Value:", val);
            console.log("Length:", val.length);
            console.log("Ends with space:", val.endsWith(' '));
            console.log("Ends with \\r:", val.endsWith('\r'));
            console.log("Hex:", Buffer.from(val).toString('hex'));
        }
    }
}
