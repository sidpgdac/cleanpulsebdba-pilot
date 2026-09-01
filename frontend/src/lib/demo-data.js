const ZONES = [
  ['Emergency', 'Ground Floor'],
  ['OPD', 'Ground Floor'],
  ['Radiology', 'Ground Floor'],
  ['General Ward', 'Level 1'],
  ['Maternity', 'Level 1'],
  ['Paediatrics', 'Level 2'],
  ['Surgery', 'Level 2'],
  ['ICU', 'Level 3'],
  ['Administration', 'Level 3'],
  ['Canteen', 'Annexe'],
  ['Visitor Block', 'Main Lobby'],
  ['Staff Block', 'Service Wing'],
];

const TYPES = ['Female', 'Male', 'Accessible', 'Unisex'];

export function buildDemoToilets(count = 56) {
  return Array.from({ length: count }, (_, index) => {
    const [area, floor] = ZONES[index % ZONES.length];
    const zoneNumber = Math.floor(index / ZONES.length) + 1;
    const healthBand = index % 14;
    const status = healthBand < 10 ? 'CLEAN' : healthBand < 12 ? 'NEEDS_CLEANING' : healthBand < 13 ? 'OVERDUE' : 'CLEANING';
    return {
      id: `demo-toilet-${String(index + 1).padStart(3, '0')}`,
      code: `BDBA-${String(index + 1).padStart(3, '0')}`,
      name: `${area} · ${TYPES[index % TYPES.length]} ${zoneNumber}`,
      area,
      floor,
      toilet_type: TYPES[index % TYPES.length],
      status,
      derived_status: status,
      demo_index: index,
      created_at: '2025-01-01T00:00:00.000Z',
      cleaning_schedule: index % 7 === 0
        ? ['07:00', '10:00', '13:00', '16:00', '19:00']
        : index % 3 === 0
          ? ['08:00', '12:00', '16:00', '20:00']
          : ['08:00', '13:00', '18:00'],
    };
  });
}
