const http = require('http');

http.get('http://localhost:5000/api/staff/orders?branch_code=MAC_DINH_CHI', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      const orders = parsed.orders || parsed.items || parsed.data || [];
      if (orders.length > 0) {
        console.log("Order keys:", Object.keys(orders[0]));
        console.log("Sample order:", JSON.stringify(orders[0], null, 2));
      } else {
        console.log("No orders found");
      }
    } catch(e) {
      console.log(e);
    }
  });
});
