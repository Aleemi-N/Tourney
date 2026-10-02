'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Standing = { rank: number; team_id: string; team_name: string; league_points: number };
type Stage = { id: string; name: string; stage_type: string; sequence: number; qualification_count: number | null; status: string; standings_rules: { win_points: number; loss_points: number; tie_break_rules: string[] } | null };
type Match = { id: string; stage_id: string | null; match_number: number | null; program_order: number; round_number: number | null; bracket_match_type: string; status: string; scheduled_at: string | null; venue: string | null; court: string | null; home_team_id: string | null; away_team_id: string | null; home_team: { name: string } | null; away_team: { name: string } | null; scorer_user_id?: string | null };
type Scorer = { user_id: string; display_name: string; email: string; roles: string[] };
type Scope = { stage_id: string | null; round_number: number | null; revision: number };
type Preview = { standings: Standing[]; matches: Array<{ label: string; home?: Standing; away?: Standing; home_source?: string; away_source?: string }> };
type Tournament = { id: string; name: string; slug: string; format: string; venue: string | null; teamCount: number; rulesReady: boolean; logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };

export function FixtureManager({ tournament, stages, matches, scorers, orderScopes, progressionPlans }: {
  tournament: Tournament; stages: Stage[]; matches: Match[]; scorers: Scorer[]; orderScopes: Scope[]; progressionPlans: Array<{ source_stage_id: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [stageName, setStageName] = useState(tournament.format === 'KNOCKOUT' ? 'Knockout Stage' : 'League Stage');
  const [qualificationCount, setQualificationCount] = useState(Math.min(4, tournament.teamCount));
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [decision, setDecision] = useState('FINISH_AFTER_LEAGUE');
  const [thirdPlace, setThirdPlace] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmationKey, setConfirmationKey] = useState(() => crypto.randomUUID());
  const [reorderModalGroup, setReorderModalGroup] = useState<{ stageId: string | null; round: number | null; stageName: string; items: Match[] } | null>(null);
  const [copiedMatchId, setCopiedMatchId] = useState<string | null>(null);

  function copyScorerLink(matchId: string) {
    const url = `${window.location.origin}/scorer/matches/${matchId}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      void navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopiedMatchId(matchId);
    setMessage('Scorer link copied to clipboard! Share it with the match scorer.');
    setTimeout(() => setCopiedMatchId(null), 3000);
  }

  const groups = useMemo(() => stages.flatMap((stage) => {
    const rounds = new Map<number, Match[]>();
    for (const match of matches.filter((item) => item.stage_id === stage.id)) {
      const round = match.round_number ?? 1;
      rounds.set(round, [...(rounds.get(round) ?? []), match]);
    }
    return [...rounds].sort(([a], [b]) => a - b).map(([round, items]) => ({ stage, round, items: [...items].sort((a,b) => a.program_order-b.program_order) }));
  }), [stages, matches]);

  async function call(key: string, operation: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    if (pending) return; setPending(key); setMessage('Saving…'); const { error } = await operation(); setPending(null); setMessage(error?.message ?? success); if (!error) router.refresh();
  }
  async function createStage() {
    if (!window.confirm(`Create “${stageName}” as the first stage?`)) return;
    await call('setup', () => createClient().rpc('save_tournament_stage', { p_tournament_id: tournament.id, p_stage_id: null, p_name: stageName, p_stage_type: tournament.format, p_sequence: 1, p_qualification_count: tournament.format === 'LEAGUE' ? qualificationCount : undefined }), 'Competition stage created.');
  }
  async function schedule(event: React.FormEvent<HTMLFormElement>, matchId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const local = String(form.get('scheduled_at') || '');
    await call(matchId, () => createClient().rpc('update_match_schedule', { p_match_id: matchId, p_scheduled_at: local ? new Date(local).toISOString() : null, p_venue: String(form.get('venue') || ''), p_court: String(form.get('court') || ''), p_status: String(form.get('status') || 'SCHEDULED') }), 'Schedule updated.');
  }
  async function saveRules(event: React.FormEvent<HTMLFormElement>, stageId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await call(`rules-${stageId}`, () => createClient().rpc('save_standings_rules', { p_stage_id: stageId, p_win_points: Number(form.get('win_points')), p_loss_points: Number(form.get('loss_points')), p_tie_break_rules: String(form.get('tie_break_rules')).split(',').map((item) => item.trim()).filter(Boolean) }), 'Standings rules saved.');
  }
  async function moveMatchTo(stageId: string | null, round: number | null, items: Match[], fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    await saveMatchOrder(stageId, round, next);
  }
  async function reorder(stageId: string | null, round: number | null, ordered: Match[], index: number, offset: -1 | 1) {
    await moveMatchTo(stageId, round, ordered, index, index + offset);
  }
  async function saveMatchOrder(stageId: string | null, round: number | null, nextOrdered: Match[]) {
    const scope = orderScopes.find((item) => item.stage_id === stageId && item.round_number === round);
    if (!scope) return setMessage('Ordering scope unavailable. Refresh and try again.');
    setPending('reorder');
    const { error } = await createClient().rpc('reorder_matches', { p_tournament_id: tournament.id, p_stage_id: stageId, p_round_number: round, p_ordered_match_ids: nextOrdered.map((item) => item.id), p_expected_revision: scope.revision });
    setPending(null);
    setMessage(error ? (error.message.includes('Stale') ? 'Order changed elsewhere. Loading authoritative order.' : error.message) : 'Match order saved successfully.');
    if (!error && reorderModalGroup) setReorderModalGroup(null);
    router.refresh();
  }
  async function previewNext(stageId: string) {
    setPending('preview'); const { data, error } = await createClient().rpc('preview_league_progression', { p_stage_id: stageId, p_decision: decision, p_include_third_place: thirdPlace }); setPending(null); setMessage(error?.message ?? 'Preview ready.'); setPreview(error ? null : data as unknown as Preview);
  }
  async function confirmNext(stageId: string) {
    if (!preview || !window.confirm('Confirm this authoritative progression decision?')) return;
    setPending('progression'); const { error } = await createClient().rpc('apply_league_progression', { p_stage_id: stageId, p_decision: decision, p_include_third_place: thirdPlace, p_idempotency_key: confirmationKey }); setPending(null); setMessage(error?.message ?? 'Progression applied.');
    if (!error) { setPreview(null); setConfirmationKey(crypto.randomUUID()); router.refresh(); }
  }
  async function poster() {
    const ordered = [...matches].sort((a,b) => (a.round_number ?? 0)-(b.round_number ?? 0) || a.program_order-b.program_order);
    
    // Group matches by round
    const roundGroups = new Map<number, typeof ordered>();
    ordered.forEach((m) => {
      const r = m.round_number ?? 1;
      roundGroups.set(r, [...(roundGroups.get(r) ?? []), m]);
    });
    const roundsList = [...roundGroups.entries()].sort(([a], [b]) => a - b);
    
    // Compute dynamic canvas height based on total rounds and matches
    const totalMatchCount = ordered.length;
    const canvasHeight = Math.max(1620, 380 + roundsList.length * 90 + totalMatchCount * 60 + 120);

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = canvasHeight;
    const c = canvas.getContext('2d');
    if (!c) return;

    // 1. Deep Midnight Blue & Obsidian Gradient Background
    const bgGrad = c.createLinearGradient(0, 0, 1080, canvasHeight);
    bgGrad.addColorStop(0, '#0a1020');
    bgGrad.addColorStop(0.3, '#060a14');
    bgGrad.addColorStop(0.8, '#03050a');
    bgGrad.addColorStop(1, '#000205');
    c.fillStyle = bgGrad;
    c.fillRect(0, 0, 1080, canvasHeight);

    // 2. Dramatic Top Golden Sunset Glow
    const topGlow = c.createRadialGradient(540, 120, 20, 540, 220, 700);
    topGlow.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
    topGlow.addColorStop(0.4, 'rgba(217, 119, 6, 0.15)');
    topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = topGlow;
    c.fillRect(0, 0, 1080, 700);

    // Decorative Court Perspective Lines
    c.strokeStyle = 'rgba(245, 158, 11, 0.08)';
    c.lineWidth = 2;
    for (let i = -200; i <= 1280; i += 160) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i * 1.4, canvasHeight);
      c.stroke();
    }

    // 3. Top Banner Subtitle
    c.fillStyle = '#f59e0b';
    c.font = '900 24px sans-serif';
    c.textAlign = 'center';
    c.letterSpacing = '8px';
    c.fillText('VOLLEYBALL TOURNAMENT LEAGUE', 540, 75);

    // 4. Main Title "LEAGUE FIXTURES" (Angled Yellow Brush Ribbon Behind)
    c.fillStyle = 'rgba(245, 158, 11, 0.15)';
    c.beginPath();
    c.moveTo(220, 95);
    c.lineTo(860, 95);
    c.lineTo(830, 175);
    c.lineTo(190, 175);
    c.closePath();
    c.fill();

    // White bold title text with glowing drop shadow
    c.fillStyle = '#ffffff';
    c.font = '900 80px sans-serif';
    c.shadowColor = 'rgba(245, 158, 11, 0.8)';
    c.shadowBlur = 30;
    c.fillText('LEAGUE FIXTURES', 540, 158);
    c.shadowBlur = 0;

    // Sub Tagline
    c.fillStyle = '#cbd5e1';
    c.font = '800 18px sans-serif';
    c.letterSpacing = '4px';
    c.fillText('PLAY   /   COMPETE   /   WIN', 540, 195);

    // 5. Tournament Info Stats Box Bar
    c.fillStyle = 'rgba(15, 23, 42, 0.9)';
    c.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.roundRect(60, 225, 960, 80, 18);
    c.fill();
    c.stroke();

    const stats = [
      { label: 'TOURNAMENT', val: tournament.name.slice(0, 18) },
      { label: 'VENUE', val: (tournament.venue || 'TBA').slice(0, 18) },
      { label: 'FORMAT', val: tournament.format || 'LEAGUE' },
      { label: 'TEAMS', val: `${tournament.teamCount} TEAMS` }
    ];

    stats.forEach((st, idx) => {
      const x = 60 + idx * 240 + 120;
      c.fillStyle = '#f59e0b';
      c.font = '800 13px sans-serif';
      c.textAlign = 'center';
      c.fillText(st.label, x, 258);

      c.fillStyle = '#ffffff';
      c.font = '900 19px sans-serif';
      c.fillText(st.val, x, 286);

      if (idx < 3) {
        c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(60 + (idx + 1) * 240, 240);
        c.lineTo(60 + (idx + 1) * 240, 290);
        c.stroke();
      }
    });

    let currentY = 340;

    // 6. Render Round Sections
    roundsList.forEach(([rndNum, rndMatches]) => {
      const rndStr = String(rndNum).padStart(2, '0');

      // Round Header Badge (Gold angled banner)
      c.fillStyle = '#f59e0b';
      c.beginPath();
      c.roundRect(60, currentY, 80, 36, 10);
      c.fill();

      c.fillStyle = '#0f172a';
      c.font = '900 20px sans-serif';
      c.textAlign = 'center';
      c.fillText(rndStr, 100, currentY + 25);

      c.fillStyle = '#ffffff';
      c.font = '900 24px sans-serif';
      c.textAlign = 'left';
      c.fillText(`ROUND ${rndNum}`, 155, currentY + 26);

      currentY += 48;

      // Table Header Strip
      c.fillStyle = 'rgba(30, 41, 59, 0.95)';
      c.fillRect(60, currentY, 960, 32);
      c.fillStyle = '#94a3b8';
      c.font = '800 13px sans-serif';

      c.textAlign = 'center';
      c.fillText('MATCH', 100, currentY + 21);
      c.fillText('TIME', 190, currentY + 21);
      c.textAlign = 'left';
      c.fillText('TEAM A', 270, currentY + 21);
      c.textAlign = 'center';
      c.fillText('VS', 540, currentY + 21);
      c.textAlign = 'right';
      c.fillText('TEAM B', 810, currentY + 21);
      c.textAlign = 'center';
      c.fillText('COURT', 960, currentY + 21);

      currentY += 36;

      // Match Rows
      rndMatches.forEach((m, idx) => {
        // Container
        c.fillStyle = idx % 2 === 0 ? 'rgba(15, 23, 42, 0.88)' : 'rgba(30, 41, 59, 0.75)';
        c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        c.lineWidth = 1;
        c.beginPath();
        c.roundRect(60, currentY, 960, 52, 10);
        c.fill();
        c.stroke();

        // Match #
        c.fillStyle = '#f59e0b';
        c.font = '900 16px sans-serif';
        c.textAlign = 'center';
        c.fillText(`${rndNum}.${idx + 1}`, 100, currentY + 32);

        // Time
        c.fillStyle = '#cbd5e1';
        c.font = '600 14px sans-serif';
        const timeStr = m.scheduled_at
          ? new Date(m.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : 'TBA';
        c.fillText(timeStr, 190, currentY + 32);

        // Team A (Home)
        c.fillStyle = '#ffffff';
        c.font = '900 19px sans-serif';
        c.textAlign = 'left';
        c.fillText((m.home_team?.name ?? 'TBD').slice(0, 22), 270, currentY + 33);

        // VS Badge (Angled Yellow Badge)
        c.fillStyle = '#f59e0b';
        c.beginPath();
        c.roundRect(518, currentY + 13, 44, 26, 6);
        c.fill();

        c.fillStyle = '#0f172a';
        c.font = '900 14px sans-serif';
        c.textAlign = 'center';
        c.fillText('VS', 540, currentY + 31);

        // Team B (Away)
        c.fillStyle = '#ffffff';
        c.font = '900 19px sans-serif';
        c.textAlign = 'right';
        c.fillText((m.away_team?.name ?? 'TBD').slice(0, 22), 810, currentY + 33);

        // Court
        c.fillStyle = '#94a3b8';
        c.font = '600 14px sans-serif';
        c.textAlign = 'center';
        c.fillText((m.court || tournament.venue || 'TBA').slice(0, 12), 960, currentY + 32);

        currentY += 60;
      });

      currentY += 24;
    });

    // 7. Footer Banner
    const footerY = canvasHeight - 50;
    c.fillStyle = '#f59e0b';
    c.font = '900 24px sans-serif';
    c.textAlign = 'left';
    c.fillText('GOOD TEAMS BUILD GREAT GAMES', 60, footerY);

    c.fillStyle = '#94a3b8';
    c.font = '700 16px sans-serif';
    c.textAlign = 'right';
    c.fillText('POWERED BY TOURNY', 1020, footerY);

    const link = document.createElement('a');
    link.download = `${tournament.slug}-league-fixtures-poster.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
  const completeLeague = stages.find((stage) => stage.stage_type==='LEAGUE' && stage.status==='COMPLETED' && !progressionPlans.some((plan) => plan.source_stage_id===stage.id));

  return <div className="space-y-10"><p role="status" className="min-h-5 text-sm text-text-secondary">{message}</p>
    <section className="space-y-4"><h2 className="text-xl font-bold">Competition Structure</h2>{stages.length===0?<div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5"><h3 className="font-bold">No competition stage configured.</h3><p className="mt-2 text-sm">{tournament.format} · {tournament.teamCount} teams · Rules {tournament.rulesReady?'ready':'missing'}</p>{!showSetup?<button onClick={()=>setShowSetup(true)} className="mt-5 min-h-11 rounded-lg bg-primary px-4 font-bold">Set Up Competition</button>:<div className="mt-5 grid gap-3 sm:grid-cols-3"><input aria-label="Stage name" placeholder="Stage name (e.g. League Stage)" value={stageName} onChange={(e)=>setStageName(e.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3" />{tournament.format==='LEAGUE'&&<input aria-label="Teams qualifying" placeholder="Teams to qualify (e.g. 4)" type="number" min="1" max={tournament.teamCount} value={qualificationCount} onChange={(e)=>setQualificationCount(Number(e.target.value))} className="min-h-11 rounded-lg border border-border bg-background px-3"/>}<button disabled={pending!==null||!tournament.rulesReady} onClick={()=>void createStage()} className="min-h-11 rounded-lg bg-primary px-4 font-bold disabled:opacity-40">Confirm & Create</button></div>}</div>:stages.map((stage)=>{const count=matches.filter((m)=>m.stage_id===stage.id).length;return <article key={stage.id} className="rounded-xl border border-border bg-surface p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold text-primary">{stage.stage_type} STAGE</p><h3 className="text-lg font-bold">{stage.name}</h3><p className="text-sm text-text-secondary">Stage {stage.sequence} · {stage.status} · {count} fixtures{stage.qualification_count?` · Top ${stage.qualification_count} qualify`:''}</p></div><button disabled={pending!==null||count>0||!tournament.rulesReady} onClick={()=>void call(stage.id,()=>createClient().rpc('generate_stage_fixtures',{p_stage_id:stage.id}),'Fixtures generated.')} className="min-h-11 rounded-lg bg-primary px-4 font-bold disabled:opacity-40">{count?'Fixtures Generated':'Generate Fixtures'}</button></div>{stage.stage_type==='LEAGUE'&&<form onSubmit={(event)=>void saveRules(event,stage.id)} className="mt-4 border-t border-border pt-4 space-y-3"><p className="text-xs text-text-secondary font-semibold uppercase tracking-wider">Points Table Rules</p><div className="grid gap-3 sm:grid-cols-3"><label className="flex flex-col gap-1 text-xs text-text-secondary">Points for a Win<input name="win_points" type="number" min="0" defaultValue={stage.standings_rules?.win_points??2} className="min-h-10 rounded-lg border border-border bg-background px-3 text-text-primary text-base font-bold"/></label><label className="flex flex-col gap-1 text-xs text-text-secondary">Points for a Loss<input name="loss_points" type="number" min="0" defaultValue={stage.standings_rules?.loss_points??0} className="min-h-10 rounded-lg border border-border bg-background px-3 text-text-primary text-base font-bold"/></label><label className="flex flex-col gap-1 text-xs text-text-secondary">Tiebreaker order <span className="text-text-muted normal-case font-normal">(comma-separated)</span><input name="tie_break_rules" defaultValue={(stage.standings_rules?.tie_break_rules??['WINS','SET_DIFFERENCE','POINT_DIFFERENCE','NAME']).join(',')} className="min-h-10 rounded-lg border border-border bg-background px-3 text-text-primary text-sm"/></label></div><button disabled={pending!==null} className="min-h-10 rounded-lg border border-border px-4 font-semibold text-sm">Save Points Rules</button></form>}</article>;})}</section>

    {completeLeague && (
      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-400">League Stage Complete</p>
        <h2 className="mt-2 text-2xl font-black">What happens next?</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ['FINISH_AFTER_LEAGUE', 'Finish Tournament'],
            ['TOP_2_FINAL', 'Top 2 → Final'],
            ['TOP_4_SEMIFINALS', 'Top 4 → Semi Finals']
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setDecision(value); setThirdPlace(false); setPreview(null); setConfirmationKey(crypto.randomUUID()); }}
              className={`min-h-12 rounded-xl border px-3 font-bold ${decision === value ? 'border-primary bg-primary/15' : 'border-border'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {decision !== 'FINISH_AFTER_LEAGUE' && (
          <label className="mt-4 flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={thirdPlace}
              onChange={(e) => { setThirdPlace(e.target.checked); setPreview(null); setConfirmationKey(crypto.randomUUID()); }}
            />
            Include Third Place Match
          </label>
        )}
        <button
          disabled={pending !== null}
          onClick={() => void previewNext(completeLeague.id)}
          className="mt-4 min-h-11 rounded-lg bg-primary px-5 font-bold disabled:opacity-40"
        >
          Preview Decision
        </button>
        {preview && (
          <div className="mt-6 rounded-xl border border-border p-4">
            <h3 className="font-black">Final Standings</h3>
            <ol className="mt-2 space-y-1 text-sm">
              {preview.standings.slice(0, 4).map((row) => (
                <li key={row.team_id}>{row.rank}. {row.team_name} · {row.league_points} pts</li>
              ))}
            </ol>
            {preview.matches.length > 0 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {preview.matches.map((m) => (
                  <div key={m.label} className="rounded-lg border border-border p-3">
                    <p className="text-xs font-black text-primary">{m.label}</p>
                    <p className="text-sm font-semibold">{m.home?.team_name ?? m.home_source} vs {m.away?.team_name ?? m.away_source}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              disabled={pending !== null}
              onClick={() => void confirmNext(completeLeague.id)}
              className="mt-5 min-h-11 rounded-lg bg-emerald-600 px-5 font-bold text-white disabled:opacity-40"
            >
              {decision === 'FINISH_AFTER_LEAGUE' ? 'Confirm & Finish Tournament' : 'Confirm & Create Next Stage'}
            </button>
          </div>
        )}
      </section>
    )}

    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Fixtures &amp; Schedule</h2>
          <p className="text-sm text-text-secondary">Saved program order is authoritative.</p>
        </div>
        {matches.length > 0 && (
          <button onClick={() => void poster()} className="min-h-11 rounded-lg border border-primary/40 px-4 text-sm font-bold text-primary hover:bg-primary/5 transition-colors">
            📋 Share Fixtures · 1080×1350
          </button>
        )}
      </div>
      <div className="mt-5 space-y-10">
        {groups.map(({ stage, round, items }) => (
          <div key={`${stage.id}-${round}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">{round}</div>
                <h3 className="text-base font-black uppercase tracking-[.15em] text-primary">{stage.stage_type === 'KNOCKOUT' ? `Knockout · Round ${round}` : `Round ${round}`}</h3>
              </div>
              {items.length > 1 && (
                <button
                  onClick={() => setReorderModalGroup({ stageId: stage.id, round, stageName: stage.name, items })}
                  className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors flex items-center gap-1.5"
                >
                  ⚡ Easy Reorder ({items.length})
                </button>
              )}
            </div>
            <div className="h-px w-full bg-gradient-to-r from-primary/40 to-transparent mb-4" />
            <div className="space-y-3">
              {items.map((match, index) => {
                const isLocked = ['LIVE', 'COMPLETED', 'CANCELLED'].includes(match.status);
                const statusColor = match.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : match.status === 'LIVE' ? 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse' : match.status === 'POSTPONED' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-primary/10 text-primary border-primary/30';
                return (
                  <article key={match.id} className="overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:border-primary/40">
                    <div className="p-4 space-y-3">
                      {/* Teams & Status Row */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary">#{match.program_order}</div>
                          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                            <p className="min-w-0 truncate text-sm font-black text-text-primary sm:text-base">{match.home_team?.name ?? 'TBD'}</p>
                            <span className="shrink-0 rounded-md bg-surface-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-text-muted">VS</span>
                            <p className="min-w-0 truncate text-sm font-black text-text-primary sm:text-base">{match.away_team?.name ?? 'TBD'}</p>
                          </div>
                        </div>
                        <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusColor}`}>{match.status}</span>
                      </div>

                      {/* Reorder & Action Bar Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border/40 pt-3">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button aria-label="Move up" title="Move up 1 position" disabled={pending !== null || index === 0 || isLocked} onClick={() => void reorder(stage.id, round, items, index, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-primary/10 disabled:opacity-20 transition-colors">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button aria-label="Move down" title="Move down 1 position" disabled={pending !== null || index === items.length - 1 || isLocked} onClick={() => void reorder(stage.id, round, items, index, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-primary/10 disabled:opacity-20 transition-colors">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          {!isLocked && items.length > 1 && (
                            <select
                              aria-label="Set match position"
                              title="Jump directly to position number"
                              value={index}
                              disabled={pending !== null}
                              onChange={(e) => void moveMatchTo(stage.id, round, items, index, Number(e.target.value))}
                              className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-bold text-primary hover:border-primary focus:outline-none transition-colors cursor-pointer"
                            >
                              {items.map((_, pos) => (
                                <option key={pos} value={pos} className="bg-[#181825] text-white">
                                  #{pos + 1}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {match.home_team_id && match.away_team_id && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Link href={`/scorer/matches/${match.id}`} className="shrink-0 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity">Score</Link>
                            <button
                              type="button"
                              onClick={() => copyScorerLink(match.id)}
                              className="shrink-0 whitespace-nowrap rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors flex items-center gap-1"
                              title="Copy direct scoring link to share with scorer"
                            >
                              📋 {copiedMatchId === match.id ? 'Copied Link!' : 'Copy Scorer Link'}
                            </button>
                            <Link href={`/t/${tournament.slug}/match/${match.id}`} className="shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-surface-muted transition-colors">Public</Link>
                            <Link href={`/t/${tournament.slug}/match/${match.id}/tv`} className="shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-surface-muted transition-colors">TV</Link>
                          </div>
                        )}
                      </div>

                      {/* Scheduled Date/Location */}
                      {match.scheduled_at ? (
                        <p className="text-xs text-text-secondary">
                          📅 {new Date(match.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          {match.venue ? ` · 📍 ${match.venue}` : ''}
                          {match.court ? ` · ${match.court}` : ''}
                        </p>
                      ) : (
                        <p className="text-xs text-text-muted italic">Date &amp; time not yet scheduled</p>
                      )}
                    </div>

                    <details className="border-t border-border">
                      <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors list-none flex items-center gap-2">
                        <span className="opacity-60">▸</span>Schedule &amp; Assign Scorer
                      </summary>
                      <div className="px-4 pb-4 pt-3 space-y-3">
                        <form onSubmit={(e) => void schedule(e, match.id)} className="grid gap-2 sm:grid-cols-5">
                          <input aria-label="Match date and time" name="scheduled_at" type="datetime-local" defaultValue={match.scheduled_at ? new Date(match.scheduled_at).toISOString().slice(0, 16) : ''} className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary" />
                          <input aria-label="Venue" name="venue" defaultValue={match.venue ?? tournament.venue ?? ''} placeholder="Venue" className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary" />
                          <input aria-label="Court" name="court" defaultValue={match.court ?? ''} placeholder="Court" className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary" />
                          <select aria-label="Schedule status" name="status" defaultValue={match.status === 'POSTPONED' ? 'POSTPONED' : 'SCHEDULED'} className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary cursor-pointer">
                            <option className="bg-[#181825] text-white">SCHEDULED</option>
                            <option className="bg-[#181825] text-white">POSTPONED</option>
                          </select>
                          <button disabled={pending !== null || isLocked} className="min-h-10 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-40">{match.scheduled_at ? 'Update' : 'Schedule'}</button>
                        </form>
                        <div>
                          <label className="block text-xs text-text-secondary font-medium mb-1.5">
                            Assigned scorer
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={match.scorer_user_id ?? ''}
                              disabled={pending !== null || !match.home_team_id || !match.away_team_id}
                              onChange={(e) => e.target.value && void call(match.id, () => createClient().rpc('assign_match_scorer', { p_match_id: match.id, p_scorer_user_id: e.target.value }), 'Scorer assigned.')}
                              className="min-h-10 flex-1 min-w-[200px] max-w-md rounded-lg border border-border bg-background px-3 text-sm font-medium text-text-primary focus:border-primary focus:outline-none transition-colors cursor-pointer"
                            >
                              <option value="" className="bg-[#181825] text-white">Unassigned (Anyone with link can score if permitted)</option>
                              {scorers.map((s) => (
                                <option key={s.user_id} value={s.user_id} className="bg-[#181825] text-white">
                                  {s.display_name} · {s.email}
                                </option>
                              ))}
                            </select>
                            {match.home_team_id && match.away_team_id && (
                              <button
                                type="button"
                                onClick={() => copyScorerLink(match.id)}
                                className="min-h-10 rounded-lg border border-primary/40 bg-primary/10 px-3.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors flex items-center gap-1.5 shrink-0"
                                title="Copy direct scoring link to share with any scorer"
                              >
                                📋 {copiedMatchId === match.id ? 'Copied Link!' : 'Copy Scorer Link'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
        {matches.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-2xl">🏐</p>
            <p className="mt-2 font-semibold text-text-secondary">No fixtures yet</p>
            <p className="text-sm text-text-muted">Generate fixtures from the Competition Structure above.</p>
          </div>
        )}
      </div>
    </section>

    {reorderModalGroup && (
      <EasyReorderModal
        group={reorderModalGroup}
        onClose={() => setReorderModalGroup(null)}
        onSave={(newOrdered) => void saveMatchOrder(reorderModalGroup.stageId, reorderModalGroup.round, newOrdered)}
        isSaving={pending === 'reorder'}
      />
    )}
  </div>;
}

function EasyReorderModal({
  group,
  onClose,
  onSave,
  isSaving
}: {
  group: { stageId: string | null; round: number | null; stageName: string; items: Match[] };
  onClose: () => void;
  onSave: (items: Match[]) => void;
  isSaving: boolean;
}) {
  const [list, setList] = useState<Match[]>([...group.items]);

  function move(from: number, to: number) {
    if (to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setList(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
          <div>
            <h3 className="text-lg font-black text-text-primary">⚡ Easy Match Reorder</h3>
            <p className="text-xs text-text-secondary">{group.stageName} · Round {group.round} ({list.length} matches)</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {list.map((match, idx) => {
            const isLocked = ['LIVE', 'COMPLETED', 'CANCELLED'].includes(match.status);
            return (
              <div
                key={match.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 text-sm transition-all hover:border-primary/40"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-black text-primary">
                    #{idx + 1}
                  </span>
                  <p className="font-bold text-text-primary truncate">
                    {match.home_team?.name ?? 'TBD'} <span className="text-text-muted font-normal text-xs">VS</span> {match.away_team?.name ?? 'TBD'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    disabled={idx === 0 || isLocked || isSaving}
                    onClick={() => move(idx, 0)}
                    title="Move to top"
                    className="px-2 py-1 text-xs font-bold rounded-lg border border-border hover:bg-primary/10 disabled:opacity-20 transition-colors"
                  >
                    Top
                  </button>
                  <button
                    disabled={idx === 0 || isLocked || isSaving}
                    onClick={() => move(idx, idx - 1)}
                    title="Move up"
                    className="p-1.5 rounded-lg border border-border hover:bg-primary/10 disabled:opacity-20 transition-colors"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    disabled={idx === list.length - 1 || isLocked || isSaving}
                    onClick={() => move(idx, idx + 1)}
                    title="Move down"
                    className="p-1.5 rounded-lg border border-border hover:bg-primary/10 disabled:opacity-20 transition-colors"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    disabled={idx === list.length - 1 || isLocked || isSaving}
                    onClick={() => move(idx, list.length - 1)}
                    title="Move to bottom"
                    className="px-2 py-1 text-xs font-bold rounded-lg border border-border hover:bg-primary/10 disabled:opacity-20 transition-colors"
                  >
                    Btm
                  </button>
                  <select
                    value={idx}
                    disabled={isLocked || isSaving}
                    onChange={(e) => move(idx, Number(e.target.value))}
                    className="h-8 rounded-lg border border-border bg-surface-muted px-2 text-xs font-bold text-primary focus:outline-none"
                  >
                    {list.map((_, p) => (
                      <option key={p} value={p}>
                        Position #{p + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border p-4 bg-surface-muted">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="min-h-10 rounded-lg border border-border px-4 text-sm font-bold hover:bg-background transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(list)}
            disabled={isSaving}
            className="min-h-10 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {isSaving ? 'Saving Order…' : 'Save New Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

