const W = 1080;
const PAD = 60;
const GOLD = '#f59e0b';
const MIN_H = 1350;

type Ctx = CanvasRenderingContext2D;

type FixtureMatch = {
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

function setFont(c: Ctx, weight: number, size: number, spacing = 0) {
  c.font = `${weight} ${size}px sans-serif`;
  c.letterSpacing = `${spacing}px`;
}

// Shrinks the font down to minSize, then truncates with an ellipsis, so text never leaves its column.
function fit(c: Ctx, text: string, maxW: number, weight: number, size: number, minSize = 16, spacing = 0) {
  let s = size;
  setFont(c, weight, s, spacing);
  while (s > minSize && c.measureText(text).width > maxW) setFont(c, weight, --s, spacing);
  if (c.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && c.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function canvas(h: number) {
  const el = document.createElement('canvas');
  el.width = W;
  el.height = h;
  const c = el.getContext('2d')!;

  const bg = c.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0c1230');
  bg.addColorStop(0.45, '#060920');
  bg.addColorStop(1, '#020308');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, h);

  glow(c, 540, 40, 680, 'rgba(245,158,11,0.40)');
  glow(c, -120, h * 0.55, 760, 'rgba(79,70,229,0.24)');
  glow(c, W + 120, h * 0.9, 700, 'rgba(234,88,12,0.20)');

  // Stadium spotlights from the top corners.
  for (const [x, dir] of [[0, 1], [W, -1]]) {
    const beam = c.createLinearGradient(x, 0, x + dir * 520, 900);
    beam.addColorStop(0, 'rgba(255,220,150,0.18)');
    beam.addColorStop(1, 'rgba(255,220,150,0)');
    c.fillStyle = beam;
    c.beginPath();
    c.moveTo(x, 0); c.lineTo(x + dir * 200, 0); c.lineTo(x + dir * 780, 950); c.lineTo(x + dir * 380, 950);
    c.closePath(); c.fill();
  }

  volleyball(c, 900, h * 0.52, 400);

  for (let i = 0; i < 7000; i++) {
    c.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    c.fillRect(Math.random() * W, Math.random() * h, 1.5, 1.5);
  }

  const vignette = c.createRadialGradient(540, h / 2, h * 0.3, 540, h / 2, h * 0.85);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = vignette;
  c.fillRect(0, 0, W, h);

  c.strokeStyle = 'rgba(245,158,11,0.28)';
  c.lineWidth = 1.5;
  c.strokeRect(24, 24, W - 48, h - 48);
  c.strokeStyle = GOLD;
  c.lineWidth = 4;
  for (const [x, y, dx, dy] of [[24, 24, 1, 1], [W - 24, 24, -1, 1], [24, h - 24, 1, -1], [W - 24, h - 24, -1, -1]]) {
    c.beginPath(); c.moveTo(x, y + dy * 56); c.lineTo(x, y); c.lineTo(x + dx * 56, y); c.stroke();
  }
  return { el, c };
}

function glow(c: Ctx, x: number, y: number, r: number, color: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function volleyball(c: Ctx, x: number, y: number, r: number) {
  c.save();
  c.strokeStyle = 'rgba(245,158,11,0.07)';
  c.lineWidth = 6;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  c.clip();
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3 - Math.PI / 2;
    c.beginPath();
    c.arc(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05, r * 0.95, a + Math.PI - 0.8, a + Math.PI + 0.8);
    c.stroke();
  }
  c.restore();
}

function header(c: Ctx, eyebrow: string, title: string, chips: string[]) {
  c.textAlign = 'center';
  c.fillStyle = GOLD;
  c.fillText(fit(c, eyebrow.toUpperCase(), W - PAD * 2, 800, 24, 16, 6), 540, 82);

  c.fillStyle = '#ffffff';
  c.shadowColor = 'rgba(245,158,11,0.7)';
  c.shadowBlur = 28;
  c.fillText(fit(c, title, W - PAD * 2, 900, 92, 48, 2), 540, 180);
  c.shadowBlur = 0;

  c.fillStyle = GOLD;
  c.beginPath(); c.roundRect(480, 202, 120, 6, 3); c.fill();

  const gap = 14;
  const maxEach = (W - PAD * 2 - gap * (chips.length - 1)) / chips.length;
  const items = chips.map((chip) => {
    const text = fit(c, chip.toUpperCase(), maxEach - 40, 800, 19, 13, 2);
    return { text, font: c.font, w: Math.min(maxEach, c.measureText(text).width + 40) };
  });
  let x = 540 - (items.reduce((sum, item) => sum + item.w, 0) + gap * (items.length - 1)) / 2;
  for (const item of items) {
    c.fillStyle = 'rgba(15,23,42,0.85)';
    c.strokeStyle = 'rgba(245,158,11,0.45)';
    c.lineWidth = 2;
    c.beginPath(); c.roundRect(x, 236, item.w, 48, 24); c.fill(); c.stroke();
    c.fillStyle = '#e2e8f0';
    c.font = item.font;
    c.letterSpacing = '2px';
    c.fillText(item.text, x + item.w / 2, 267);
    x += item.w + gap;
  }
  return 320;
}

function footer(c: Ctx, h: number) {
  c.fillStyle = 'rgba(245,158,11,0.25)';
  c.fillRect(PAD, h - 108, W - PAD * 2, 2);
  c.textAlign = 'left';
  c.fillStyle = GOLD;
  setFont(c, 900, 22, 4);
  c.fillText('GOOD TEAMS BUILD GREAT GAMES', PAD, h - 52);
  c.textAlign = 'right';
  c.fillStyle = '#94a3b8';
  setFont(c, 700, 16, 3);
  c.fillText('POWERED BY TOURNY', W - PAD, h - 52);
}

async function deliver(el: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((resolve) => el.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const file = new File([blob], filename, { type: 'image/png' });
  // Phones get the native share sheet (WhatsApp, Instagram…); desktops just download.
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (error) {
      if ((error as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareFixturesPoster(t: { name: string; slug: string; venue: string | null; format: string; teamCount: number }, matches: FixtureMatch[]) {
  const rounds = new Map<number, FixtureMatch[]>();
  for (const m of [...matches].sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0) || a.program_order - b.program_order)) {
    const r = m.round_number ?? 1;
    rounds.set(r, [...(rounds.get(r) ?? []), m]);
  }
  const showRounds = rounds.size > 1;
  const ROW = 76, GAP = 12, ROUND_H = 58;
  const h = Math.max(MIN_H, 320 + rounds.size * (showRounds ? ROUND_H : 0) + matches.length * (ROW + GAP) + 150);
  const { el, c } = canvas(h);

  let y = header(c, t.name, t.format === 'KNOCKOUT' ? 'KNOCKOUT FIXTURES' : 'LEAGUE FIXTURES',
    [t.venue || 'Venue TBA', `${t.teamCount} teams`, `${matches.length} matches`]);

  let number = 0;
  for (const [round, items] of rounds) {
    if (showRounds) {
      c.textAlign = 'left';
      c.fillStyle = GOLD;
      setFont(c, 900, 26, 4);
      const label = `ROUND ${round}`;
      c.fillText(label, PAD, y + 34);
      c.fillStyle = 'rgba(245,158,11,0.3)';
      c.fillRect(PAD + c.measureText(label).width + 20, y + 25, W - PAD * 2 - c.measureText(label).width - 20, 2);
      y += ROUND_H;
    }
    items.forEach((m, idx) => {
      number++;
      c.fillStyle = idx % 2 ? 'rgba(22,30,62,0.78)' : 'rgba(12,18,42,0.78)';
      c.strokeStyle = 'rgba(255,255,255,0.09)';
      c.lineWidth = 1;
      c.beginPath(); c.roundRect(PAD, y, W - PAD * 2, ROW, 16); c.fill(); c.stroke();

      c.fillStyle = 'rgba(245,158,11,0.14)';
      c.strokeStyle = 'rgba(245,158,11,0.6)';
      c.beginPath(); c.roundRect(80, y + 18, 64, 40, 10); c.fill(); c.stroke();
      c.textAlign = 'center';
      c.fillStyle = GOLD;
      setFont(c, 900, 20);
      c.fillText(`M${number}`, 112, y + 45);

      c.fillStyle = '#ffffff';
      c.textAlign = 'right';
      c.fillText(fit(c, m.home_team?.name ?? 'TBD', 316, 800, 28), 490, y + 48);

      c.fillStyle = GOLD;
      c.beginPath(); c.arc(540, y + ROW / 2, 26, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0f172a';
      c.textAlign = 'center';
      setFont(c, 900, 18);
      c.fillText('VS', 540, y + 45);

      c.fillStyle = '#ffffff';
      c.textAlign = 'left';
      c.fillText(fit(c, m.away_team?.name ?? 'TBD', 290, 800, 28), 590, y + 48);

      const when = m.scheduled_at ? new Date(m.scheduled_at) : null;
      const sub = m.court || (when ? when.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');
      c.textAlign = 'right';
      c.fillStyle = '#e2e8f0';
      c.fillText(fit(c, when ? when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'TBA', 104, 700, 18, 13), 1000, y + (sub ? 34 : 44));
      if (sub) {
        c.fillStyle = '#94a3b8';
        c.fillText(fit(c, sub, 104, 600, 14, 11), 1000, y + 56);
      }
      y += ROW + GAP;
    });
  }

  footer(c, h);
  await deliver(el, `${t.slug}-fixtures.png`);
}

export async function shareStandingsPoster(t: { name: string; slug: string }, stage: { name: string; qualification_count: number | null }, rows: StandingRow[]) {
  const ROW = 72, GAP = 10;
  const h = Math.max(MIN_H, 320 + 54 + rows.length * (ROW + GAP) + 70 + 150);
  const { el, c } = canvas(h);
  const q = stage.qualification_count ?? 0;

  let y = header(c, t.name, 'POINTS TABLE', [stage.name, `${rows.length} teams`, ...(q ? [`Top ${q} qualify`] : [])]);

  const cols: Array<[string, number]> = [['P', 610], ['W', 675], ['L', 740], ['SETS', 822], ['PD', 905], ['PTS', 980]];
  c.fillStyle = 'rgba(20,28,58,0.85)';
  c.beginPath(); c.roundRect(PAD, y, W - PAD * 2, 44, 12); c.fill();
  c.fillStyle = '#94a3b8';
  setFont(c, 800, 15, 2);
  c.textAlign = 'center';
  c.fillText('POS', 110, y + 28);
  for (const [label, x] of cols) c.fillText(label, x, y + 28);
  c.textAlign = 'left';
  c.fillText('TEAM', 160, y + 28);
  y += 54;

  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  for (const row of rows) {
    const qualified = row.rank <= q;
    c.fillStyle = qualified ? 'rgba(70,45,10,0.72)' : 'rgba(12,18,42,0.78)';
    c.strokeStyle = qualified ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.09)';
    c.lineWidth = qualified ? 1.5 : 1;
    c.beginPath(); c.roundRect(PAD, y, W - PAD * 2, ROW, 16); c.fill(); c.stroke();

    c.fillStyle = qualified ? GOLD : 'rgba(255,255,255,0.12)';
    c.beginPath(); c.arc(110, y + ROW / 2, 22, 0, Math.PI * 2); c.fill();
    c.fillStyle = qualified ? '#0f172a' : '#ffffff';
    c.textAlign = 'center';
    setFont(c, 900, 20);
    c.fillText(String(row.rank), 110, y + 43);

    c.fillStyle = '#ffffff';
    c.textAlign = 'left';
    c.fillText(fit(c, row.team_name, 400, 800, 26), 160, y + 46);

    const values = [row.played, row.won, row.lost, `${row.sets_won}-${row.sets_lost}`, signed(row.points_for - row.points_against)];
    c.textAlign = 'center';
    c.fillStyle = '#e2e8f0';
    values.forEach((v, i) => c.fillText(fit(c, String(v), 70, 700, 22, 14), cols[i][1], y + 45));
    c.fillStyle = GOLD;
    c.fillText(fit(c, String(row.league_points), 70, 900, 28, 16), cols[5][1], y + 47);
    y += ROW + GAP;
  }

  if (q) {
    c.fillStyle = GOLD;
    c.beginPath(); c.roundRect(PAD, y + 18, 18, 18, 4); c.fill();
    c.fillStyle = '#cbd5e1';
    c.textAlign = 'left';
    setFont(c, 700, 17, 1);
    c.fillText('Qualified for the next stage', PAD + 30, y + 33);
  }

  footer(c, h);
  await deliver(el, `${t.slug}-points-table.png`);
}
