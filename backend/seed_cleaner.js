import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data: facility } = await supabase.from('facilities').select('id').eq('code', 'BDBA').single()
  
  if (!facility) {
    console.error('BDBA facility not found. Did you run demo-seed.sql?')
    return
  }
  
  const pinHash = await bcrypt.hash('1234', 10)
  
  const { data, error } = await supabase.from('cleaners').insert({
    facility_id: facility.id,
    full_name: 'Amit Patel',
    pin_hash: pinHash,
    active: true
  }).select()
  
  if (error) {
    if (error.code === '23505') {
      console.log('Cleaner already exists')
    } else {
      console.error(error)
    }
  } else {
    console.log('Successfully added cleaner Amit Patel with PIN 1234', data)
  }
}

run()
