const axios = require('axios');
axios.get('http://localhost:3000/menu/danh-muc')
  .then(res => {
    console.log("Status:", res.status);
    console.log("Length:", res.data.length);
    console.log("Data:", JSON.stringify(res.data).substring(0, 300));
  })
  .catch(err => {
    console.error("Error fetching danh-muc:", err.message);
  });
