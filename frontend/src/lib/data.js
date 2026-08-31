// Shared data constants and helpers — mirrors reference app/lib/data.ts
// Used by both admin and public components for consistent labeling/icons

export const statusMeta = {
  clean:       { label: 'Clean',       icon: '✓' },
  alert:       { label: 'Clean now',   icon: '!' },
  due:         { label: 'Due soon',    icon: '◷' },
  maintenance: { label: 'Maintenance', icon: '⚒' },
};

export const toiletTypeMeta = {
  Female:     { icon: '♀', english: 'WOMEN',      marathi: 'स्त्री / महिला',  tone: 'female' },
  Male:       { icon: '♂', english: 'MEN',        marathi: 'पुरुष',           tone: 'male' },
  Accessible: { icon: '♿', english: 'ACCESSIBLE', marathi: 'सुगम्य',         tone: 'accessible' },
  Staff:      { icon: '◆', english: 'STAFF',      marathi: 'कर्मचारी',        tone: 'staff' },
  Visitor:    { icon: '◉', english: 'VISITOR',    marathi: 'अभ्यागत',         tone: 'visitor' },
  Unisex:     { icon: '⚥', english: 'ALL GENDER', marathi: 'सर्वांसाठी',     tone: 'unisex' },
  Other:      { icon: 'WC', english: 'TOILET',    marathi: 'स्वच्छतागृह',     tone: 'other' },
};

export const issueOptions = [
  ['🚽', 'Dirty toilet',      'housekeeping'],
  ['💦', 'Wet / slippery floor', 'housekeeping'],
  ['◌',  'Bad smell',          'housekeeping'],
  ['🧼', 'No soap',            'housekeeping'],
  ['🚱', 'No water',           'maintenance'],
  ['▰',  'Bin full',           'housekeeping'],
  ['🔧', 'Broken fixture',     'maintenance'],
  ['⛔', 'Blocked toilet',     'maintenance'],
];

/** Generate the initials from a full name */
export function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .join('')
    .slice(0, 2);
}

/** Format a Supabase timestamp as human-readable relative time */
export function relativeTime(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} hr ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** Build a canvas evidence collage from a clean-site photo and a selfie */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx, image, x, y, w, h) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

export async function buildEvidenceCollage(
  cleanSrc, selfieSrc,
  toiletId, toiletName, floor, dept, cleanerName,
  gpsLat = null, gpsLng = null, gpsAddress = null
) {
  const [clean, selfie] = await Promise.all([loadImage(cleanSrc), loadImage(selfieSrc)]);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  // Background — full clean-site photo
  drawCover(ctx, clean, 0, 0, 1200, 900);

  // Gradient overlay at bottom for readability
  const shade = ctx.createLinearGradient(0, 580, 0, 900);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 580, 1200, 320);

  // Selfie inset thumbnail
  ctx.save();
  ctx.beginPath();
  if ('roundRect' in ctx) ctx.roundRect(848, 520, 318, 338, 20);
  else ctx.rect(848, 520, 318, 338);
  ctx.clip();
  drawCover(ctx, selfie, 848, 520, 318, 338);
  ctx.restore();

  // Selfie border
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  if ('roundRect' in ctx) ctx.roundRect(848, 520, 318, 338, 20);
  else ctx.rect(848, 520, 318, 338);
  ctx.stroke();

  // Selfie name label
  ctx.fillStyle = 'rgba(0,0,0,0.80)';
  ctx.fillRect(848, 810, 318, 48);
  ctx.fillStyle = '#fff';
  ctx.font = '600 22px Arial';
  ctx.fillText(cleanerName, 868, 841);

  // ── TEXT METADATA BLOCK ──
  const stamp = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 30px Arial';
  ctx.fillText('BMC CleanPulse', 42, 750);

  ctx.font = '600 24px Arial';
  ctx.fillText(`${toiletId}  ·  ${toiletName}`, 42, 790);

  ctx.font = '500 20px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`${floor || ''}${floor && dept ? ' · ' : ''}${dept || ''}  |  ${stamp}`, 42, 826);

  // ── GPS STAMP ──
  if (gpsLat && gpsLng) {
    const coordStr = `${Number(gpsLat).toFixed(5)}°N, ${Number(gpsLng).toFixed(5)}°E`;
    const locStr = gpsAddress ? `  ·  ${gpsAddress}` : '';

    // GPS badge background
    const gpsText = `\u{1F4CD}  ${coordStr}${locStr}`;
    ctx.font = '500 19px Arial';
    const textWidth = Math.min(ctx.measureText(gpsText).width + 32, 820);

    ctx.fillStyle = 'rgba(34,197,94,0.25)';
    ctx.beginPath();
    if ('roundRect' in ctx) ctx.roundRect(36, 848, textWidth, 34, 6);
    else ctx.rect(36, 848, textWidth, 34);
    ctx.fill();

    ctx.strokeStyle = 'rgba(34,197,94,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if ('roundRect' in ctx) ctx.roundRect(36, 848, textWidth, 34, 6);
    else ctx.rect(36, 848, textWidth, 34);
    ctx.stroke();

    ctx.fillStyle = '#86efac';
    ctx.font = '500 18px Arial';
    ctx.fillText(gpsText, 52, 870);
  } else {
    // No GPS — show unverified badge
    ctx.fillStyle = 'rgba(245,158,11,0.20)';
    ctx.beginPath();
    if ('roundRect' in ctx) ctx.roundRect(36, 848, 260, 34, 6);
    else ctx.rect(36, 848, 260, 34);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245,158,11,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fcd34d';
    ctx.font = '500 18px Arial';
    ctx.fillText('\u26A0  GPS not verified', 52, 870);
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Reverse-geocode lat/lng to a short address using OSM Nominatim (free, no API key) */
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    const a = data.address || {};
    // Build a compact label like "BDBA Hospital, Bidar"
    const parts = [
      a.amenity || a.building || a.road,
      a.suburb || a.neighbourhood,
      a.city || a.town || a.village || a.district,
    ].filter(Boolean);
    return parts.slice(0, 2).join(', ');
  } catch {
    return null;
  }
}

