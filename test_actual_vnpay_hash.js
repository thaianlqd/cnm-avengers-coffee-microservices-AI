const crypto = require('crypto');

function buildUrl(secret) {
    const params = {
        vnp_Amount: '5900000',
        vnp_Command: 'pay',
        vnp_CreateDate: '20260725040824',
        vnp_CurrCode: 'VND',
        vnp_ExpireDate: '20260725042824',
        vnp_IpAddr: '172.18.0.10',
        vnp_Locale: 'vn',
        vnp_OrderInfo: 'Thanh toan don hang 7ec00395-808b-4713-bead-deee3f21ada3',
        vnp_OrderType: 'billpayment',
        vnp_ReturnUrl: 'https://unentwined-johanne-biasedly.ngrok-free.dev/customers/83addedd-d7c9-4149-b241-be77ff9fcf0c/thanh-toan/vnpay/ket-qua',
        vnp_TmnCode: '4E3OIH3H',
        vnp_TxnRef: '7ec00395-808b-4713-bead-deee3f21ada3_1784927303782',
        vnp_Version: '2.1.0'
    };

    const sortedKeys = Object.keys(params).sort();
    
    // Method 1: Encode values with +
    const signData1 = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key])).replace(/%20/g, '+')}`)
      .join('&');
    const signed1 = crypto.createHmac('sha512', secret).update(Buffer.from(signData1, 'utf-8')).digest('hex');
    const urlQuery1 = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key])).replace(/%20/g, '+')}`)
      .join('&');
    const url1 = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?${urlQuery1}&vnp_SecureHash=${signed1}`;

    // Method 2: No encode values for hash, encode for url
    const signData2 = sortedKeys
      .map(key => `${key}=${String(params[key])}`)
      .join('&');
    const signed2 = crypto.createHmac('sha512', secret).update(Buffer.from(signData2, 'utf-8')).digest('hex');
    
    const urlQuery2 = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
      .join('&');
    const url2 = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?${urlQuery2}&vnp_SecureHash=${signed2}`;

    return { url1, url2, signData2, signed2 };
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
    
    console.log("My signData2 matches log:", urls.signData2 === "vnp_Amount=5900000&vnp_Command=pay&vnp_CreateDate=20260725040824&vnp_CurrCode=VND&vnp_ExpireDate=20260725042824&vnp_IpAddr=172.18.0.10&vnp_Locale=vn&vnp_OrderInfo=Thanh toan don hang 7ec00395-808b-4713-bead-deee3f21ada3&vnp_OrderType=billpayment&vnp_ReturnUrl=https://unentwined-johanne-biasedly.ngrok-free.dev/customers/83addedd-d7c9-4149-b241-be77ff9fcf0c/thanh-toan/vnpay/ket-qua&vnp_TmnCode=4E3OIH3H&vnp_TxnRef=7ec00395-808b-4713-bead-deee3f21ada3_1784927303782&vnp_Version=2.1.0");
    console.log("My hash matches log:", urls.signed2 === "4e2ae43758e15292229cf4fb270e8ba7cd48ef5c8731c07293643ec19e6f893b4dcb7e3722a65f80392446f03c9e653a54063ef6c01856856bfed2a6749f1e4c");
    
    console.log("Testing Method 1 (Encode with +):");
    console.log(await fetchUrl(urls.url1));
    
    console.log("Testing Method 2 (No encode for hash):");
    console.log(await fetchUrl(urls.url2));
}

run();
