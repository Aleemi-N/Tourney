import { fixturePageCount, formatFixtureTime, POSTER_HEIGHT, POSTER_WIDTH, type PosterFixture, type PosterModel, type PosterTemplateId, variantSeed } from './model';

export type RenderPosterOptions = { template: PosterTemplateId; variant: number; page: number };

type Palette = { background: string; surface: string; text: string; muted: string; accent: string; accent2: string };

const FALLBACK_PRIMARY = '#7c3aed';
const FALLBACK_SECONDARY = '#14b8a6';

function validColor(value: string | null, fallback: string) {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  return value;
}

function palette(model: PosterModel, template: PosterTemplateId): Palette {
  const primary = validColor(model.tournament.primaryColor, FALLBACK_PRIMARY);
  const secondary = validColor(model.tournament.secondaryColor, FALLBACK_SECONDARY);
  if (template === 'clean-minimal') return { background: '#f8fafc', surface: '#ffffff', text: '#101828', muted: '#526071', accent: primary, accent2: secondary };
  if (template === 'brand-fusion') return { background: primary, surface: '#ffffff', text: '#ffffff', muted: '#e2e8f0', accent: secondary, accent2: '#ffffff' };
  if (template === 'bold-matchday') return { background: '#fb3b20', surface: '#111827', text: '#ffffff', muted: '#fde7df', accent: '#ffe600', accent2: primary };
  if (template === 'night-volley') return { background: '#031326', surface: '#09233d', text: '#f8fbff', muted: '#9db5cc', accent: '#38bdf8', accent2: secondary };
  return { background: '#090b12', surface: '#171a26', text: '#ffffff', muted: '#aab2c5', accent: primary, accent2: secondary };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 700) {
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, preferred: number, minimum: number, weight = 800) {
  let size = preferred;
  while (size > minimum) { setFont(ctx, size, weight); if (ctx.measureText(text).width <= maxWidth) break; size -= 1; }
  return size;
}

function wrapTitle(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  for (let size = 58; size >= 38; size -= 2) {
    setFont(ctx, size, 900);
    const words = text.split(/\s+/); const lines: string[] = [];
    for (const word of words) {
      if (lines.length === 0) { lines.push(word); continue; }
      const candidate = `${lines.at(-1) ?? ''} ${word}`.trim();
      if (ctx.measureText(candidate).width <= maxWidth) lines[lines.length - 1] = candidate;
      else lines.push(word);
    }
    if (lines.length <= 2 && lines.every((line) => ctx.measureText(line).width <= maxWidth)) return { lines, size };
  }
  return { lines: [text], size: fitText(ctx, text, maxWidth, 38, 25, 900) };
}

function drawBackground(ctx: CanvasRenderingContext2D, template: PosterTemplateId, colors: Palette, seed: number) {
  ctx.fillStyle = colors.background; ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  if (template === 'arena-dark') {
    const glow = ctx.createRadialGradient(540, 220, 20, 540, 300, 760); glow.addColorStop(0, `${colors.accent}aa`); glow.addColorStop(1, '#090b1200'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 1080, 900);
    ctx.strokeStyle = '#ffffff14'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(540, 1120, 450, 180, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (template === 'bold-matchday') {
    ctx.fillStyle = colors.surface; ctx.beginPath(); ctx.moveTo(650, 0); ctx.lineTo(1080, 0); ctx.lineTo(1080, 1350); ctx.lineTo(830, 1350); ctx.closePath(); ctx.fill();
    ctx.fillStyle = colors.accent; ctx.save(); ctx.translate((seed % 140) - 70, 0); ctx.rotate(-0.15); ctx.fillRect(760, -100, 80, 1600); ctx.restore();
  } else if (template === 'clean-minimal') {
    ctx.fillStyle = colors.accent; ctx.fillRect(0, 0, 28, 1350); ctx.fillStyle = '#e7ebf0'; for (let y = 80; y < 1320; y += 54) ctx.fillRect(70, y, 940, 1);
  } else if (template === 'brand-fusion') {
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1350); gradient.addColorStop(0, colors.background); gradient.addColorStop(1, colors.accent); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#ffffff12'; ctx.beginPath(); ctx.moveTo(0, 260); ctx.lineTo(1080, 0); ctx.lineTo(1080, 310); ctx.lineTo(0, 570); ctx.fill();
  } else {
    const glow = ctx.createRadialGradient(180, 20, 5, 180, 20, 390); glow.addColorStop(0, '#dff8ffcc'); glow.addColorStop(.18, `${colors.accent}55`); glow.addColorStop(1, '#03132600'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 600, 600);
    ctx.strokeStyle = '#38bdf82b'; ctx.lineWidth = 3; ctx.strokeRect(125, 690, 830, 560); ctx.beginPath(); ctx.moveTo(540, 690); ctx.lineTo(540, 1250); ctx.stroke();
  }
}

async function loadLogo(url: string | null) {
  if (!url) return null;
  try { const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url; await image.decode(); return image; } catch { return null; }
}

function drawLogo(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, colors: Palette, template: PosterTemplateId) {
  const x = template === 'clean-minimal' ? 850 : 875; const y = 62; const size = 140;
  ctx.fillStyle = template === 'clean-minimal' ? '#eef2f6' : '#ffffff14'; roundRect(ctx, x, y, size, size, 28); ctx.fill();
  if (image) { const scale = Math.min((size - 24) / image.naturalWidth, (size - 24) / image.naturalHeight); const width = image.naturalWidth * scale; const height = image.naturalHeight * scale; ctx.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height); }
  else { ctx.fillStyle = colors.accent; setFont(ctx, 43, 900); ctx.textAlign = 'center'; ctx.fillText('T', x + size / 2, y + 91); ctx.textAlign = 'left'; }
}

function drawHeader(ctx: CanvasRenderingContext2D, model: PosterModel, colors: Palette, template: PosterTemplateId, image: HTMLImageElement | null, page: number, pages: number) {
  drawLogo(ctx, image, colors, template);
  ctx.fillStyle = colors.accent; setFont(ctx, 21, 900); ctx.fillText(template === 'bold-matchday' ? 'MATCHDAY // FIXTURES' : 'MATCH SCHEDULE  •  FIXTURES', 70, 80);
  const title = wrapTitle(ctx, model.tournament.name, 740); ctx.fillStyle = colors.text; setFont(ctx, title.size, 900);
  title.lines.forEach((line, index) => ctx.fillText(line, 70, 139 + index * (title.size + 5)));
  const metaY = title.lines.length > 1 ? 245 : 205; ctx.fillStyle = colors.muted; setFont(ctx, 20, 600);
  ctx.fillText(model.commonVenue ?? 'VENUES SHOWN WITH EACH FIXTURE', 70, metaY);
  if (pages > 1) { ctx.textAlign = 'right'; ctx.fillText(`PAGE ${page + 1} / ${pages}`, 1010, metaY); ctx.textAlign = 'left'; }
}

function fixtureDate(fixture: PosterFixture) {
  return fixture.scheduledAt ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(fixture.scheduledAt)).toUpperCase() : 'DATE TO BE CONFIRMED';
}

function drawFixture(ctx: CanvasRenderingContext2D, fixture: PosterFixture, x: number, y: number, width: number, height: number, colors: Palette, template: PosterTemplateId) {
  const compact = height < 105; const teamSize = compact ? 22 : 27; const inset = compact ? 20 : 25;
  if (template === 'clean-minimal') { ctx.fillStyle = colors.accent; ctx.fillRect(x, y, 5, height); ctx.fillStyle = '#ffffffd9'; }
  else if (template === 'bold-matchday') { ctx.fillStyle = colors.surface; ctx.beginPath(); ctx.moveTo(x + 18, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width - 18, y + height); ctx.lineTo(x, y + height); ctx.closePath(); }
  else if (template === 'brand-fusion') { ctx.fillStyle = '#08111ecc'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width - 26, y); ctx.lineTo(x + width, y + height); ctx.lineTo(x + 26, y + height); ctx.closePath(); }
  else { ctx.fillStyle = template === 'night-volley' ? '#071b30dd' : '#171a26e8'; roundRect(ctx, x, y, width, height, template === 'arena-dark' ? height / 2 : 14); }
  ctx.fill();
  ctx.fillStyle = colors.muted; setFont(ctx, compact ? 14 : 16, 700); ctx.fillText(`#${fixture.programOrder}  ${formatFixtureTime(fixture.scheduledAt)}`, x + inset, y + 25);
  const available = (width - inset * 2 - 76) / 2; const homeSize = fitText(ctx, fixture.homeTeam, available, teamSize, 15, 900); ctx.fillStyle = colors.text; setFont(ctx, homeSize, 900); ctx.textAlign = 'right'; ctx.fillText(fixture.homeTeam, x + width / 2 - 42, y + (compact ? 60 : 67));
  ctx.fillStyle = colors.accent; setFont(ctx, compact ? 18 : 22, 900); ctx.textAlign = 'center'; ctx.fillText('VS', x + width / 2, y + (compact ? 60 : 67));
  const awaySize = fitText(ctx, fixture.awayTeam, available, teamSize, 15, 900); ctx.fillStyle = colors.text; setFont(ctx, awaySize, 900); ctx.textAlign = 'left'; ctx.fillText(fixture.awayTeam, x + width / 2 + 42, y + (compact ? 60 : 67));
  if (!compact) { const location = [fixture.venue, fixture.court].filter(Boolean).join(' • '); if (location) { ctx.fillStyle = colors.muted; setFont(ctx, 14, 600); ctx.fillText(location, x + inset, y + height - 15); } }
  ctx.textAlign = 'left';
}

export async function renderPoster(canvas: HTMLCanvasElement, model: PosterModel, options: RenderPosterOptions) {
  canvas.width = POSTER_WIDTH; canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas rendering is unavailable.');
  const colors = palette(model, options.template); const pages = fixturePageCount(model.fixtures.length); const page = Math.min(Math.max(0, options.page), pages - 1); const fixtures = model.fixtures.slice(page * 12, page * 12 + 12);
  drawBackground(ctx, options.template, colors, variantSeed(model, options.template, options.variant));
  const logo = await loadLogo(model.tournament.logoUrl); drawHeader(ctx, model, colors, options.template, logo, page, pages);
  const top = 295; const bottom = 1288; const columns = fixtures.length > 8 ? 2 : 1; const gap = columns === 2 ? 20 : 14; const columnWidth = columns === 2 ? 465 : 940; const perColumn = Math.ceil(fixtures.length / columns); const groupChanges = fixtures.reduce((count, fixture, index) => count + (index === 0 || fixture.roundNumber !== fixtures[index - 1].roundNumber || fixtureDate(fixture) !== fixtureDate(fixtures[index - 1]) ? 1 : 0), 0);
  const availableHeight = bottom - top - groupChanges * 31 - Math.max(0, perColumn - 1) * gap; const rowHeight = Math.min(fixtures.length <= 4 ? 155 : 125, Math.max(78, Math.floor(availableHeight / Math.max(1, perColumn))));
  const cursors = Array.from({ length: columns }, () => top);
  fixtures.forEach((fixture, index) => {
    const column = Math.floor(index / perColumn); const previous = index % perColumn === 0 ? null : fixtures[index - 1]; const changed = !previous || fixture.roundNumber !== previous.roundNumber || fixtureDate(fixture) !== fixtureDate(previous);
    if (changed) { ctx.fillStyle = colors.accent; setFont(ctx, 15, 900); const round = fixture.roundNumber === null ? '' : `ROUND ${fixture.roundNumber}  •  `; ctx.fillText(`${round}${fixtureDate(fixture)}`, 70 + column * (columnWidth + 20), cursors[column] + 16); cursors[column] += 31; }
    drawFixture(ctx, fixture, 70 + column * (columnWidth + 20), cursors[column], columnWidth, rowHeight, colors, options.template); cursors[column] += rowHeight + gap;
  });
  ctx.fillStyle = colors.muted; setFont(ctx, 17, 600); ctx.fillText('Official fixture data • Tourny', 70, 1320); ctx.textAlign = 'right'; ctx.fillText('Powered by Tourny', 1010, 1320); ctx.textAlign = 'left';
}

export function posterFileName(model: PosterModel, template: PosterTemplateId, page: number) {
  const suffix = fixturePageCount(model.fixtures.length) > 1 ? `-page-${page + 1}` : '';
  return `${model.tournament.slug}-fixtures-${template}${suffix}-1080x1350.png`;
}
