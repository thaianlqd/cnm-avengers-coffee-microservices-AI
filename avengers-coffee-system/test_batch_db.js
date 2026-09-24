const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: process.env.DB_PORT || 6543,
  user: process.env.DB_USER || 'postgres.ankudo1234',
  password: process.env.DB_PASSWORD || 'afSMTJmSkNwOEmAT',
  database: process.env.DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log("Checking order: 639d779a-2383-42bc-a84a-35139dca5a38");
    const res = await pool.query(
      "SELECT id, ma_don_hang, shipper_id, status, is_batched, delivery_latitude, delivery_longitude FROM orders.shipper_delivery WHERE ma_don_hang = $1",
      ['639d779a-2383-42bc-a84a-35139dca5a38']
    );
    console.log("Delivery for 639d:", JSON.stringify(res.rows, null, 2));
    
    if (res.rows.length > 0) {
      const shipperId = res.rows[0].shipper_id;
      const res2 = await pool.query(
        "SELECT id, ma_don_hang, shipper_id, status, is_batched, delivery_latitude, delivery_longitude FROM orders.shipper_delivery WHERE shipper_id = $1 AND status IN ('CONFIRMED', 'PICKING_UP', 'IN_TRANSIT', 'DANG_GIAO')",
        [shipperId]
      );
      console.log(`All active deliveries for shipper ${shipperId}:`, JSON.stringify(res2.rows, null, 2));

      // Check tracking table as well
      const orderIds = res2.rows.map(r => r.ma_don_hang);
      if (orderIds.length > 0) {
        const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(', ');
        const trackingQuery = `SELECT ma_don_hang, shipper_id, status, destination_latitude, destination_longitude, delivery_address FROM tracking.delivery_tracking WHERE ma_don_hang IN (${placeholders})`;
        const res3 = await pool.query(trackingQuery, orderIds);
        console.log("Tracking info for these orders:", JSON.stringify(res3.rows, null, 2));
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
