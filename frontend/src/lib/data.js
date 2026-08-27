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

export async function buildEvidenceCollage(cleanSrc, selfieSrc, toiletId, toiletName, floor, dept, cleanerName) {
  const [clean, selfie] = await Promise.all([loadImage(cleanSrc), loadImage(selfieSrc)]);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  drawCover(ctx, clean, 0, 0, 1200, 900);
  const shade = ctx.createLinearGradient(0, 650, 0, 900);
  shade.addColorStop(0, 'rgba(4,28,21,0)');
  shade.addColorStop(1, 'rgba(4,28,21,.92)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 620, 1200, 280);
  ctx.save();
  ctx.beginPath();
  if ('roundRect' in ctx) ctx.roundRect(850, 520, 310, 330, 24);
  else ctx.rect(850, 520, 310, 330);
  ctx.clip();
  drawCover(ctx, selfie, 850, 520, 310, 330);
  ctx.restore();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  ctx.beginPath();
  if ('roundRect' in ctx) ctx.roundRect(850, 520, 310, 330, 24);
  else ctx.rect(850, 520, 310, 330);
  ctx.stroke();
  ctx.fillStyle = 'rgba(4,28,21,.82)';
  ctx.fillRect(850, 790, 310, 60);
  ctx.fillStyle = '#fff';
  ctx.font = '700 24px Arial';
  ctx.fillText(cleanerName, 872, 827);
  const stamp = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  ctx.fillStyle = '#fff';
  ctx.font = '700 30px Arial';
  ctx.fillText('BMC CleanPulse', 42, 768);
  ctx.font = '600 23px Arial';
  ctx.fillText(`${toiletId}  ·  ${toiletName}`, 42, 809);
  ctx.font = '500 20px Arial';
  ctx.fillStyle = '#d3ebe1';
  ctx.fillText(`${floor} · ${dept}  |  ${stamp}`, 42, 846);
  return canvas.toDataURL('image/jpeg', 0.9);
}
