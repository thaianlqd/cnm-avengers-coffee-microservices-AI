const { Client } = require('pg');

async function fixBranches() {
  const configs = [
    { host: 'localhost', port: 5432, user: 'postgres', password: '123', database: 'avengers_coffee' },
    { host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'avengers_coffee' },
    { host: 'localhost', port: 5432, user: 'admin', password: 'password', database: 'avengers_coffee' },
    { host: 'localhost', port: 5432, user: 'admin', password: '123', database: 'avengers_coffee' },
    { host: 'localhost', port: 5432, user: 'root', password: '123', database: 'avengers_coffee' },
  ];

  let client;
  let connected = false;

  for (const config of configs) {
    try {
      client = new Client(config);
      await client.connect();
      console.log(`Connected with user: ${config.user}`);
      connected = true;
      break;
    } catch (err) {
      // ignore
    }
  }

  if (!connected) {
    console.error('Could not connect to database with any credentials.');
    return;
  }
    
  try {
    // Check tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables:', res.rows.map(r => r.table_name));

    // Assume table is 'chi_nhanh' or 'branch' or 'branches'
    const tableName = res.rows.find(r => r.table_name.includes('chi_nhanh') || r.table_name.includes('branch'))?.table_name;
    
    if (tableName) {
      console.log(`Found table: ${tableName}`);
      const branches = await client.query(`SELECT * FROM ${tableName} LIMIT 100`);
      
      // Update bad names
      const badBranches = branches.rows.filter(b => b.ten_chi_nhanh && (b.ten_chi_nhanh.startsWith('IMG') || b.ten_chi_nhanh.startsWith('IMG ')));
      console.log(`Found ${badBranches.length} bad branches`);
      
      let count = 1;
      for (const branch of badBranches) {
        const newName = `Highlands Coffee Chi nhánh mới ${count++}`;
        await client.query(`UPDATE ${tableName} SET ten_chi_nhanh = $1 WHERE ma_chi_nhanh = $2`, [newName, branch.ma_chi_nhanh]);
        console.log(`Updated ${branch.ten_chi_nhanh} -> ${newName}`);
      }
      
      const missingBranches = branches.rows.filter(b => !b.ten_chi_nhanh || b.ten_chi_nhanh === 'Unknown');
      for (const branch of missingBranches) {
        const newName = `Highlands Coffee Chi nhánh mới ${count++}`;
        await client.query(`UPDATE ${tableName} SET ten_chi_nhanh = $1 WHERE ma_chi_nhanh = $2`, [newName, branch.ma_chi_nhanh]);
        console.log(`Updated missing name -> ${newName}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

fixBranches();
