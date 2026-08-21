/**
 * Cleanup script - Run once then delete this file too:
 *   node cleanup.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SYSTEM = path.join(ROOT, 'avengers-coffee-system');

// ── Root-level files to delete ──────────────────────────────────────────────
const ROOT_FILES = [
  'check_container.js',
  'check_env.js',
  'get_logs.js',
  'get_logs.py',
  'test_vnpay_hash.js',
  'test_actual_vnpay_hash.js',
  'kafka_logs.txt',
  'diff_refactor.txt',
  'diff_vnpay.txt',
  'file_da_chay_thanh_cong.ts',
  'supabase_setup.sql',
  'generate_use_cases_guest.py',
  'FIREWALL-OPEN-PORTS.bat',
  'enable-firewall-port-3000.bat',
  '~$M_ChucNangNguoiDung.docx',
  'highlands_coffee_stores_final.csv',
];

// ── avengers-coffee-system/ files to delete ──────────────────────────────────
const SYSTEM_FILES = [
  'check_docker.js',
  'get_logs.js',
  'get_logs2.js',
  'test_api.js',
  'test_danh_muc.js',
  'test_vnpay_hash.js',
];

let deleted = 0;
let errors = 0;

function del(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('✅ DELETED:', path.relative(ROOT, filePath));
      deleted++;
    } else {
      console.log('⚠️  NOT FOUND:', path.relative(ROOT, filePath));
    }
  } catch (e) {
    console.log('❌ ERROR:', path.relative(ROOT, filePath), '-', e.message);
    errors++;
  }
}

console.log('═══════════════════════════════════════════');
console.log('  Avengers Coffee — Cleanup Script');
console.log('═══════════════════════════════════════════\n');

console.log('── Root files ──────────────────────────────');
ROOT_FILES.forEach(f => del(path.join(ROOT, f)));

console.log('\n── avengers-coffee-system/ files ───────────');
SYSTEM_FILES.forEach(f => del(path.join(SYSTEM, f)));

console.log('\n═══════════════════════════════════════════');
console.log(`  Done! Deleted: ${deleted} | Errors: ${errors}`);
console.log('  Now delete this cleanup.js file manually.');
console.log('═══════════════════════════════════════════');
