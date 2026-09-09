import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.join(__dirname, '../public/provinces.json');

const URL = 'https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master/json/vn_only_simplified_json_generated_data_vn_units.json';

async function sync() {
  try {
    const res = await fetch(URL);
    const tree = await res.json();
    
    // Data is an array of Provinces, each containing a Wards array.
    const formatted = tree.map(province => ({
      name: province.FullName,
      wards: (province.Wards || []).map(ward => ({
        name: ward.FullName
      }))
    }));
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(formatted, null, 2));
    console.log('Successfully generated provinces.json at', OUTPUT_PATH);
  } catch (err) {
    console.error('Error fetching tree.json:', err.message);
  }
}

sync();
