const crypto = require('crypto');

function buildUrl(secret) {
    const params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: '4E3OIH3H',
        vnp_Amount: '1000000',
        vnp_CreateDate: '20230809112233',
        vnp_CurrCode: 'VND',
        vnp_IpAddr: '127.0.0.1',
        vnp_Locale: 'vn',
        vnp_OrderInfo: 'Thanh toan don hang 123',
        vnp_OrderType: 'billpayment',
        vnp_ReturnUrl: 'http://localhost:3000/ket-qua',
        vnp_TxnRef: '12345',
        vnp_ExpireDate: '20230809114233',
    };

    const sortedKeys = Object.keys(params).sort();
    
    // Method 1: Encode values with +
    const signData1 = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key])).replace(/%20/g, '+')}`)
      .join('&');
    const signed1 = crypto.createHmac('sha512', secret).update(Buffer.from(signData1, 'utf-8')).digest('hex');
    const url1 = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?${signData1}&vnp_SecureHash=${signed1}`;

    // Method 2: No encode values
    const signData2 = sortedKeys
      .map(key => `${key}=${String(params[key])}`)
      .join('&');
    const signed2 = crypto.createHmac('sha512', secret).update(Buffer.from(signData2, 'utf-8')).digest('hex');
    
    const urlQuery2 = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
      .join('&');
    const url2 = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?${urlQuery2}&vnp_SecureHash=${signed2}`;

    return { url1, url2 };
}

async function testUrl(url) {
    try {
        const fetch = require('node-fetch'); // If available, otherwise https
        const res = await fetch(url);
        const text = await res.text();
        if (text.includes('code=70') || text.includes('Sai chữ ký')) {
            return 'INVALID (Sai chu ky)';
        }
        if (text.includes('Mã merchant không tồn tại')) {
            return 'INVALID (Merchant ko ton tai)';
        }
        return 'VALID (No error 70)';
    } catch (e) {
        return 'FETCH_ERROR: ' + e.message;
    }
}

const https = require('https');
function fetchUrl(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data.includes('code=70') || data.includes('Sai chữ ký')) {
                    resolve('INVALID (Sai chu ky)');
                } else if (data.includes('Mã merchant không tồn tại')) {
                    resolve('INVALID (Merchant ko ton tai)');
                } else {
                    resolve('VALID (No error 70)');
                }
            });
        }).on('error', (e) => resolve('FETCH_ERROR: ' + e.message));
    });
}

async function run() {
    const secret = 'IPBN8JP3TZ1O8G3GS5D2RO63OY99LGFO';
    const urls = buildUrl(secret);
    
    console.log("Testing Method 1 (Encode with +):");
    console.log(await fetchUrl(urls.url1));
    
    console.log("Testing Method 2 (No encode for hash):");
    console.log(await fetchUrl(urls.url2));
}

run();
