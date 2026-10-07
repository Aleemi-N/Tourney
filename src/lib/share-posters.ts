import { League_Spartan } from 'next/font/google';

const spartan = League_Spartan({ subsets: ['latin'] });

const W = 1080;
const X0 = 88;
const X1 = W - 88;
const MIN_H = 1350;
const BG_TOP = '#8a1838';
const BG_BOTTOM = '#5c0d26';
const ACCENT = '#0a0a0a';
const ACCENT_TEXT = '#ffffff';
const GOLD = '#d6b46a';

type Ctx = CanvasRenderingContext2D;

type PosterTournament = { name: string; slug: string; venue?: string | null; logoUrl?: string | null };

type FixtureMatch = {
  stage_id: string | null;
  bracket_match_type: string;
  round_number: number | null;
  program_order: number;
  scheduled_at: string | null;
  court: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
};

type StandingRow = {
  rank: number; team_name: string; played: number; won: number; lost: number;
  league_points: number; sets_won: number; sets_lost: number; points_for: number; points_against: number;
};

let family = 'sans-serif';

function setFont(c: Ctx, weight: number, size: number, spacing = 0) {
  c.font = `${weight} ${size}px ${family}`;
  c.letterSpacing = `${spacing}px`;
}

// Shrinks the font down to minSize, then truncates with an ellipsis, so text never leaves its box.
function fit(c: Ctx, text: string, maxW: number, weight: number, size: number, minSize = 16, spacing = 0) {
  let s = size;
  setFont(c, weight, s, spacing);
  while (s > minSize && c.measureText(text).width > maxW) setFont(c, weight, --s, spacing);
  if (c.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && c.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

async function prepare(logoUrl?: string | null) {
  family = `${spartan.style.fontFamily}, sans-serif`;
  await Promise.all([800, 700, 600].map((w) => document.fonts.load(`${w} 40px ${family}`))).catch(() => undefined);
  if (!logoUrl) return null;
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 4000);
    img.src = logoUrl;
  });
}

// Eight-point stars on a grid, like a stadium tile pattern.
function pattern(c: Ctx, h: number) {
  c.save();
  c.strokeStyle = 'rgba(255,255,255,0.07)';
  c.lineWidth = 2;
  const step = 180;
  for (let y = -step; y < h + step; y += step) {
    for (let x = -step; x < W + step; x += step) {
      const ox = (y / step) % 2 ? step / 2 : 0;
      c.save();
      c.translate(x + ox, y);
      for (const angle of [0, Math.PI / 4]) {
        c.save();
        c.rotate(angle);
        c.strokeRect(-48, -48, 96, 96);
        c.restore();
      }
      c.beginPath();
      c.moveTo(-step / 2, 0); c.lineTo(-68, 0);
      c.moveTo(68, 0); c.lineTo(step / 2, 0);
      c.moveTo(0, -step / 2); c.lineTo(0, -68);
      c.moveTo(0, 68); c.lineTo(0, step / 2);
      c.stroke();
      c.restore();
    }
  }
  c.restore();
}

const FOOTER_H = 96;

function canvas(h: number) {
  const el = document.createElement('canvas');
  el.width = W;
  el.height = h;
  const c = el.getContext('2d')!;
  const bg = c.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  c.fillStyle = bg;
  c.fillRect(0, 0, W, h);
  pattern(c, h - FOOTER_H);
  const shine = c.createRadialGradient(540, 200, 0, 540, 200, 700);
  shine.addColorStop(0, 'rgba(255,255,255,0.10)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = shine;
  c.fillRect(0, 0, W, h);
  return { el, c };
}

function footer(c: Ctx, h: number, venue: string | null | undefined) {
  const y = h - FOOTER_H;
  c.fillStyle = '#4a0a1f';
  c.fillRect(0, y, W, FOOTER_H);
  c.fillStyle = GOLD;
  c.fillRect(0, y - 14, W, 3);
  c.fillRect(0, y - 6, W, 2);

  c.textAlign = 'left';
  c.fillStyle = '#ffffff';
  setFont(c, 800, 44, -1);
  c.save();
  c.translate(X0, y + 64);
  c.transform(1, 0, -0.18, 1, 0, 0);
  c.fillText('tourny', 0, 0);
  c.restore();

  c.textAlign = 'right';
  c.fillStyle = GOLD;
  setFont(c, 700, 20, 1);
  c.fillText('VENUE', X1, y + 42);
  c.fillText(fit(c, (venue || 'To be announced').toUpperCase(), 520, 700, 24, 14, 1), X1, y + 70);
}

// Logo, tournament name, big title and the black pill. Returns the y where rows start.
function header(c: Ctx, logo: HTMLImageElement | null, name: string, title: string, pill: string) {
  let y = 56;
  if (logo) {
    const size = 136, cy = y + size / 2;
    c.save();
    c.beginPath(); c.arc(540, cy, size / 2, 0, Math.PI * 2); c.clip();
    const scale = Math.max(size / logo.width, size / logo.height);
    c.drawImage(logo, 540 - (logo.width * scale) / 2, cy - (logo.height * scale) / 2, logo.width * scale, logo.height * scale);
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 4;
    c.beginPath(); c.arc(540, cy, size / 2 + 2, 0, Math.PI * 2); c.stroke();
    y += size + 14;
  }
  c.textAlign = 'center';
  c.fillStyle = '#ffffff';
  c.fillText(fit(c, name.toUpperCase(), 760, 700, 26, 16, 3), 540, y + 26);
  c.fillStyle = GOLD;
  c.fillRect(540 - 70, y + 40, 140, 2);

  c.fillStyle = '#ffffff';
  c.shadowColor = 'rgba(0,0,0,0.35)';
  c.shadowOffsetY = 6;
  c.shadowBlur = 18;
  c.fillText(fit(c, title, X1 - X0, 800, 150, 80, 2), 540, y + 182);
  c.shadowColor = 'transparent';

  const text = fit(c, pill.toUpperCase(), 760, 700, 36, 20, 1);
  const pw = c.measureText(text).width + 84;
  c.fillStyle = '#0a0a0a';
  c.beginPath(); c.roundRect(540 - pw / 2, y + 212, pw, 62, 12); c.fill();
  c.fillStyle = '#ffffff';
  c.fillText(text, 540, y + 255);
  return y + 312;
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

function teamColor(name: string) {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash}, 70%, 45%)`;
}

function badge(c: Ctx, name: string | null, x: number, y: number, r = 27) {
  c.fillStyle = name ? teamColor(name) : 'rgba(255,255,255,0.18)';
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#ffffff';
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  setFont(c, 800, Math.round(r * 0.7));
  c.fillText(name ? initials(name) : '?', x, y + r * 0.26);
}

function bar(c: Ctx, y: number, h: number) {
  c.fillStyle = 'rgba(25,4,12,0.55)';
  c.beginPath(); c.roundRect(X0, y, X1 - X0, h, 8); c.fill();
}

async function deliver(images: Array<{ el: HTMLCanvasElement; name: string }>) {
  const files = (await Promise.all(images.map(({ el, name }) =>
    new Promise<File | null>((resolve) => el.toBlob((b) => resolve(b ? new File([b], name, { type: 'image/png' }) : null), 'image/png')),
  ))).filter((f): f is File => !!f);
  // Phones get the native share sheet (WhatsApp, Instagram…) with every poster; desktops download each.
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return; } catch (error) {
      if ((error as Error).name === 'AbortError') return;
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    await new Promise((r) => setTimeout(r, 400));
  }
}

const KO_NAME: Record<string, string> = { SEMIFINAL: 'SEMI FINAL', FINAL: 'FINAL', THIRD_PLACE: '3RD PLACE' };
const slot = (m: FixtureMatch, from: string) => (m.bracket_match_type === 'FINAL' ? `Winner ${from}` : m.bracket_match_type === 'THIRD_PLACE' ? `Loser ${from}` : 'TBD');
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' }).replace(',', '').replace(/(\w+) (\d+) (\w+)/, '$1 $3 $2');
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const ROW_H = 68, BOX_H = 84, ROW_GAP = 30, LABEL_H = 50;

function fixturesPoster(t: PosterTournament, logo: HTMLImageElement | null, pill: string, rows: Array<{ m: FixtureMatch; label: string }>) {
  const withLabels = rows.some((r) => r.m.court);
  const per = ROW_H + ROW_GAP + (withLabels ? LABEL_H : 0);
  const head = (logo ? 150 : 0) + 56 + 312;
  const body = rows.length * per;
  const h = Math.max(MIN_H, head + body + FOOTER_H + 60);
  const { el, c } = canvas(h);
  let y = header(c, logo, t.name, 'FIXTURES', pill);
  y += Math.max(0, (h - FOOTER_H - 50 - y - body) / 2);

  const boxW = 236, boxX = 540 - boxW / 2, side = boxX - (X0 + 84) - 16;
  // One name size for the whole poster (the longest name decides), so rows look even.
  const nameSize = Math.max(26, Math.min(...rows.flatMap(({ m }) => [m.home_team?.name ?? slot(m, 'SF1'), m.away_team?.name ?? slot(m, 'SF2')]).map((n) => {
    let size = 36;
    setFont(c, 700, size);
    while (size > 26 && c.measureText(n).width > side) setFont(c, 700, --size);
    return size;
  })));
  for (const { m, label } of rows) {
    if (withLabels) {
      c.textAlign = 'center';
      c.fillStyle = '#ffffff';
      c.fillText(fit(c, m.court ?? '', 400, 700, 28, 16), 540, y + 24);
      y += LABEL_H;
    }
    bar(c, y, ROW_H);
    const home = m.home_team?.name ?? null, away = m.away_team?.name ?? null;
    badge(c, home, X0 + 42, y + ROW_H / 2);
    badge(c, away, X1 - 42, y + ROW_H / 2);
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.fillText(fit(c, home ?? slot(m, 'SF1'), side, 700, nameSize, 18), X0 + 84 + side / 2, y + ROW_H / 2 + 12);
    c.fillText(fit(c, away ?? slot(m, 'SF2'), side, 700, nameSize, 18), X1 - 84 - side / 2, y + ROW_H / 2 + 12);

    c.fillStyle = ACCENT;
    c.beginPath(); c.roundRect(boxX, y - (BOX_H - ROW_H) / 2, boxW, BOX_H, 10); c.fill();
    c.fillStyle = ACCENT_TEXT;
    c.textAlign = 'center';
    c.fillText(fit(c, label, boxW - 24, 700, 15, 11, 2), 540, y + 13);
    c.fillText(fit(c, m.scheduled_at ? time(m.scheduled_at) : 'TBA', boxW - 24, 800, 48, 24), 540, y + ROW_H / 2 + 27);
    y += ROW_H + ROW_GAP;
  }
  footer(c, h, t.venue);
  return el;
}

export async function shareFixturesPoster(
  t: PosterTournament & { teamCount: number },
  stages: Array<{ id: string; stage_type: string; sequence: number }>,
  allMatches: FixtureMatch[],
) {
  const logo = await prepare(t.logoUrl);
  // Share the latest stage that has fixtures: the league first, then the knockout once it exists.
  const stage = [...stages].sort((a, b) => b.sequence - a.sequence).find((s) => allMatches.some((m) => m.stage_id === s.id));
  const knockout = stage?.stage_type === 'KNOCKOUT';
  const matches = (stage ? allMatches.filter((m) => m.stage_id === stage.id) : allMatches)
    .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0) || a.program_order - b.program_order);
  const number = new Map(matches.map((m, i) => [m, i + 1]));
  const semis = matches.filter((m) => m.bracket_match_type === 'SEMIFINAL');
  const label = (m: FixtureMatch) => !knockout ? `MATCH ${number.get(m)}`
    : m.bracket_match_type === 'SEMIFINAL' ? `SEMI FINAL ${semis.indexOf(m) + 1}` : KO_NAME[m.bracket_match_type] ?? `MATCH ${number.get(m)}`;

  // One poster per match day; anything not yet scheduled goes on its own poster.
  const byDay = new Map<string, FixtureMatch[]>();
  const unscheduled: FixtureMatch[] = [];
  for (const m of [...matches].sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '') || a.program_order - b.program_order)) {
    if (!m.scheduled_at) { unscheduled.push(m); continue; }
    const key = dayKey(new Date(m.scheduled_at));
    byDay.set(key, [...(byDay.get(key) ?? []), m]);
  }
  const images = [...byDay.values()].map((day, i) => ({
    el: fixturesPoster(t, logo, longDate(day[0].scheduled_at!), day.map((m) => ({ m, label: label(m) }))),
    name: `${t.slug}-fixtures-day-${i + 1}.png`,
  }));
  if (unscheduled.length) {
    images.push({
      el: fixturesPoster(t, logo, knockout ? 'Knockout stage' : `${unscheduled.length} matches · dates TBA`, unscheduled.map((m) => ({ m, label: label(m) }))),
      name: `${t.slug}-fixtures${images.length ? '-unscheduled' : ''}.png`,
    });
  }
  await deliver(images);
}

export async function shareStandingsPoster(t: PosterTournament, stage: { name: string; qualification_count: number | null }, rows: StandingRow[]) {
  const logo = await prepare(t.logoUrl);
  const q = stage.qualification_count ?? 0;
  const cutoff = q > 0 && q < rows.length;
  const ROW = 68, GAP = 22;
  const head = (logo ? 150 : 0) + 56 + 312;
  const body = 44 + rows.length * (ROW + GAP) + (cutoff ? 34 : 0);
  const h = Math.max(MIN_H, head + body + FOOTER_H + 60);
  const { el, c } = canvas(h);
  let y = header(c, logo, t.name, 'POINTS TABLE', q ? `${stage.name} · Top ${q} qualify` : stage.name);
  y += Math.max(0, (h - FOOTER_H - 50 - y - body) / 2);

  const cols: Array<[string, number]> = [['P', 556], ['W', 612], ['L', 668], ['SETS', 746], ['PD', 830]];
  const PTS_X = X1 - 48;
  c.fillStyle = 'rgba(255,255,255,0.7)';
  setFont(c, 700, 18, 2);
  c.textAlign = 'center';
  for (const [name, x] of cols) c.fillText(name, x, y + 20);
  c.fillText('PTS', PTS_X, y + 20);
  c.textAlign = 'left';
  c.fillText('TEAM', X0 + 128, y + 20);
  y += 44;

  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  for (const row of rows) {
    const qualified = row.rank <= q;
    bar(c, y, ROW);
    c.fillStyle = qualified ? ACCENT : 'rgba(255,255,255,0.16)';
    c.beginPath(); c.roundRect(X0, y, 56, ROW, [8, 0, 0, 8]); c.fill();
    c.fillStyle = qualified ? ACCENT_TEXT : '#ffffff';
    c.textAlign = 'center';
    setFont(c, 800, 34);
    c.fillText(String(row.rank), X0 + 28, y + ROW / 2 + 12);

    badge(c, row.team_name, X0 + 96, y + ROW / 2, 24);
    c.fillStyle = '#ffffff';
    c.textAlign = 'left';
    c.fillText(fit(c, row.team_name, 300, 700, 32, 16), X0 + 132, y + ROW / 2 + 11);

    const values = [row.played, row.won, row.lost, `${row.sets_won}-${row.sets_lost}`, signed(row.points_for - row.points_against)];
    c.textAlign = 'center';
    c.fillStyle = '#ffffff';
    values.forEach((v, i) => c.fillText(fit(c, String(v), 60, 600, 26, 14), cols[i][1], y + ROW / 2 + 9));

    c.fillStyle = qualified ? ACCENT : 'rgba(255,255,255,0.22)';
    c.beginPath(); c.roundRect(PTS_X - 48, y - 8, 96, ROW + 16, 10); c.fill();
    c.fillStyle = qualified ? ACCENT_TEXT : '#ffffff';
    c.fillText(fit(c, String(row.league_points), 80, 800, 40, 20), PTS_X, y + ROW / 2 + 14);
    y += ROW + GAP;

    if (cutoff && row.rank === q) {
      c.strokeStyle = ACCENT;
      c.lineWidth = 2;
      c.setLineDash([12, 10]);
      c.beginPath(); c.moveTo(X0, y + 4); c.lineTo(X1, y + 4); c.stroke();
      c.setLineDash([]);
      c.fillStyle = BG_BOTTOM;
      c.fillRect(540 - 130, y - 8, 260, 24);
      c.fillStyle = ACCENT;
      setFont(c, 700, 15, 3);
      c.fillText('QUALIFICATION LINE', 540, y + 10);
      y += 34;
    }
  }

  footer(c, h, t.venue);
  await deliver([{ el, name: `${t.slug}-points-table.png` }]);
}
