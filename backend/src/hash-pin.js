import bcrypt from 'bcryptjs'

const pin = process.argv[2]

if (!pin || !/^\d{4,8}$/.test(pin)) {
  console.error('Usage: npm run hash-pin -- 1103')
  process.exit(1)
}

console.log(await bcrypt.hash(pin, 12))
