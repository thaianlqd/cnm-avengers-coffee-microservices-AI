const crypto = require('crypto');
const qs = require('querystring'); // or qs if we have it

function sortObject(obj) {
	let sorted = {};
	let str = [];
	let key;
	for (key in obj){
		if (obj.hasOwnProperty(key)) {
		str.push(encodeURIComponent(key));
		}
	}
	str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
    }
    return sorted;
}

const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: '4E3OIH3H',
    vnp_Amount: '10000',
    vnp_CreateDate: '20230101120000',
    vnp_CurrCode: 'VND',
    vnp_IpAddr: '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: 'Thanh toan don hang 123456',
    vnp_OrderType: 'billpayment',
    vnp_ReturnUrl: 'https://unentwined-johanne-biasedly.ngrok-free.dev/customers/USR_xxx/thanh-toan/vnpay/ket-qua',
    vnp_TxnRef: 'COD-123456-123456',
    vnp_ExpireDate: '20230101122000',
};

const sortedKeys = Object.keys(params).sort();
const mySignData = sortedKeys
    .map((key) => {
        const value = params[key];
        if (value === null || value === undefined || value === '') return null;
        return `${encodeURIComponent(key)}=${encodeURIComponent(String(value)).replace(/%20/g, '+')}`;
    })
    .filter(Boolean)
    .join('&');

const sortedObj = sortObject(params);
// use built-in querystring module for stringify as VNPay example
const querystring = require('querystring');
// Note: querystring.stringify doesn't have encode: false option in the same way as qs. It has an encodeURIComponent option.
const vnpSignData = querystring.stringify(sortedObj, '&', '=', { encodeURIComponent: (str) => str });

console.log("My signData:", mySignData);
console.log("VN signData:", vnpSignData);
console.log("Are they equal?", mySignData === vnpSignData);
