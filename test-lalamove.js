const crypto = require('crypto');

const baseUrl = 'https://rest.sandbox.lalamove.com';
const apiKey = 'pk_test_00c1e4c9e28b2ceed7f4277cc01a9fbe';
const apiSecret = 'sk_test_/KMBha1uWJamsdwyqLLoKGRKzi0TIp9uWVc3la7hpRK8jM8';
const market = 'VN';

function generateSignature(method, path, body) {
  const epoch = new Date().getTime().toString();
  const rawSignature = `${epoch}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(rawSignature).digest('hex');
  return { token: `hmac ${apiKey}:${epoch}:${signature}`, epoch };
}

async function test() {
  const path = '/v3/quotations';
  const body = {
    data: {
      scheduleAt: new Date(Date.now() + 30 * 60000).toISOString(),
      serviceType: "MOTORCYCLE",
      specialRequests: [],
      language: "vi_VN",
      stops: [
        {
          coordinates: { lat: "10.786576", lng: "106.697554" },
          address: "74 Nguyễn Đình Chiểu, Quận 1, Hồ Chí Minh"
        },
        {
          coordinates: { lat: "10.772596", lng: "106.698022" },
          address: "Bến Thành, Quận 1, Hồ Chí Minh"
        }
      ],
      item: {
        quantity: "1",
        weight: "LESS_THAN_3_KG",
        categories: ["FOOD_DELIVERY"],
        handlingInstructions: ["KEEP_UPRIGHT"]
      }
    }
  };
  
  const bodyStr = JSON.stringify(body);
  const { token, epoch } = generateSignature('POST', path, bodyStr);
  
  console.log("Getting Quotation...");
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'Market': market,
      'Request-ID': crypto.randomUUID(),
    },
    body: bodyStr
  });
  
  const data = await res.json();
  console.log("Quote Status:", res.status);
  console.log("Quote Response:", JSON.stringify(data, null, 2));

  if (!data.data || !data.data.quotationId) {
    console.error("Failed to get quotation");
    return;
  }

  const quotationId = data.data.quotationId;
  console.log("Got quotationId:", quotationId);

  // Now place order
  const orderPath = '/v3/orders';
  const orderBody = {
    data: {
      quotationId,
      sender: {
        stopId: data.data.stops[0].stopId,
        name: "Avengers Coffee",
        phone: "+84901234567"
      },
      recipients: [
        {
          stopId: data.data.stops[1].stopId,
          name: "Khach Hang",
          phone: "+84987654321",
          remarks: "Giao cẩn thận"
        }
      ],
      isPodEnabled: false
    }
  };

  const orderBodyStr = JSON.stringify(orderBody);
  const orderSig = generateSignature('POST', orderPath, orderBodyStr);

  console.log("Placing Order...");
  const orderRes = await fetch(baseUrl + orderPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': orderSig.token,
      'Market': market,
      'Request-ID': crypto.randomUUID(),
    },
    body: orderBodyStr
  });

  const orderData = await orderRes.json();
  console.log("Order Status:", orderRes.status);
  console.log("Order Response:", JSON.stringify(orderData, null, 2));
}

test().catch(console.error);
