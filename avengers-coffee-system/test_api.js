const axios = require('axios');
axios.get('http://localhost:3000/menu/san-pham')
  .then(res => console.log("DATA:", JSON.stringify(res.data).substring(0, 500)))
  .catch(err => console.error("ERROR:", err.message));
