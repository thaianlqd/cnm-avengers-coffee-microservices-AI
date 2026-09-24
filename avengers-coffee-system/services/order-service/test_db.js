const { DataSource } = require('typeorm');
const fs = require('fs');

async function run() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: 'postgres://postgres.seneuycwihbyqjdtcdvu:afSMTJmSkNwOEmAT@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require',
    ssl: { rejectUnauthorized: false },
    schema: 'order'
  });
  await dataSource.initialize();
  const res = await dataSource.query(`SELECT ma_don_hang, shipper_id, status, is_batched FROM "order".shipper_delivery WHERE ma_don_hang = 'a0e7f973-9b98-4311-9ca4-4dce41574146';`);
  console.log("ORDER 1:", res);
  
  const allInTransit = await dataSource.query(`SELECT ma_don_hang, shipper_id, status, is_batched FROM "order".shipper_delivery WHERE status = 'IN_TRANSIT';`);
  console.log("ALL IN_TRANSIT:", allInTransit);
  
  await dataSource.destroy();
}
run().catch(console.error);
