#!/usr/bin/env node
/**
 * CLI utility: hash a 4-digit cleaner PIN with bcrypt.
 *
 * Usage from the project root:
 *   npm run hash-pin -w backend -- 1234
 *
 * Or directly:
 *   node backend/src/utils/hash-pin.js 1234
 *
 * The resulting hash is compatible with pgcrypto's crypt() using blowfish (bf) algorithm.
 * You can insert it directly into the cleaners table:
 *
 *   insert into public.cleaners (facility_id, full_name, pin_hash)
 *   values ('FACILITY_UUID', 'Meena', 'PASTE_HASH_HERE');
 */

import bcrypt from 'bcryptjs';

const ROUNDS = 12;

async function main() {
  const pin = process.argv[2];

  if (!pin) {
    console.error('Usage: node src/utils/hash-pin.js <4-digit-pin>');
    process.exit(1);
  }

  if (!/^\d{4}$/.test(pin)) {
    console.error('Error: PIN must be exactly 4 digits (0-9)');
    process.exit(1);
  }

  console.log(`Hashing PIN "${pin}" with bcrypt (${ROUNDS} rounds)...`);
  const hash = await bcrypt.hash(pin, ROUNDS);
  console.log('\nBcrypt hash:');
  console.log(hash);
  console.log('\nSQL insert:');
  console.log(`insert into public.cleaners (facility_id, full_name, pin_hash) select id, 'CLEANER_NAME', '${hash}' from public.facilities where code='FACILITY_CODE';`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
