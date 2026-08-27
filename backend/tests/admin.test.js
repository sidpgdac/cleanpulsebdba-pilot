import { test, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

let testFacilityId;
const adminId = '00000000-0000-0000-0000-000000000000'

beforeAll(async () => {
  // Check if test facility already exists and delete
  await db.from('facilities').delete().eq('code', 'TESTXYZ')

  const { data, error } = await db.from('facilities').insert({
    code: 'TESTXYZ',
    name: 'Test Concurrency Facility'
  }).select().single()
  
  if (error) throw error
  testFacilityId = data.id
})

afterAll(async () => {
  if (testFacilityId) {
    // Cascade delete handles toilets, qr_codes, units, etc.
    await db.from('facilities').delete().eq('id', testFacilityId)
  }
})

test('atomic toilet creation avoids duplicates with concurrency', async () => {
  const p1 = db.rpc('create_toilet_with_qr', {
    p_facility_id: testFacilityId, p_building: 'Main', p_floor: '1', p_area: 'Test',
    p_name: 'Test Toilet 1', p_toilet_type: null, p_num_units: 2, p_cleaning_interval_minutes: 120,
    p_actor_id: adminId, p_public_app_url: 'http://localhost'
  })
  
  const p2 = db.rpc('create_toilet_with_qr', {
    p_facility_id: testFacilityId, p_building: 'Main', p_floor: '1', p_area: 'Test',
    p_name: 'Test Toilet 2', p_toilet_type: null, p_num_units: 1, p_cleaning_interval_minutes: 120,
    p_actor_id: adminId, p_public_app_url: 'http://localhost'
  })

  const [r1, r2] = await Promise.all([p1, p2])

  expect(r1.error).toBeNull()
  expect(r2.error).toBeNull()

  const codes = [r1.data.toilet_code, r2.data.toilet_code].sort()
  
  expect(codes[0]).toBe('TESTXYZ-T001')
  expect(codes[1]).toBe('TESTXYZ-T002')

  // Identify which one is which to check units
  const t1 = r1.data.toilet_code === 'TESTXYZ-T001' ? r1.data : r2.data
  
  const { data: units } = await db.from('toilet_units').select('*').eq('toilet_id', t1.toilet_id)
  
  // Since we passed 2 units for p1 and 1 unit for p2, we must check by checking original arguments? 
  // Wait, we don't know which RPC call got T001 and which got T002 due to race conditions.
  // We can just verify that 3 units were created total.
  const { data: allUnits } = await db.from('toilet_units').select('*').in('toilet_id', [r1.data.toilet_id, r2.data.toilet_id])
  expect(allUnits.length).toBe(3)
})
