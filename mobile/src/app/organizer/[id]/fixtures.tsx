import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, ChevronDown, ChevronUp, MapPin } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Choice, Field } from '@/components/form';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { portalCard, Section } from '@/components/shell';
import { Text } from '@/components/text';
import { FixturesPoster, PosterShare, useLogoUrl } from '@/components/poster';
import { Progression } from '@/components/progression';
import { QrCard } from '@/components/qr';
import { RoundTools } from '@/components/round-tools';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading, StatusPill } from '@/components/ui';
import { api, siteUrl } from '@/lib/api';
import { PRESET_OPTIONS, presetRuleArgs, type PresetKey } from '@/lib/rules';
import { useTheme } from '@/theme';

type Rules = { win_points: number; loss_points: number; draw_points: number; tie_break_rules: string[] } | null;
type Stage = { id: string; name: string; stage_type: string; sequence: number; qualification_count: number | null; status: string; standings_rules: Rules };
type Match = {
  id: string; stage_id: string | null; match_number: number | null; program_order: number | null; round_number: number | null; status: string; sets_to_win: number | null;
  format_override: boolean | null; result_type: string | null; scheduled_at: string | null; venue: string | null; court: string | null; home_team_id: string | null; away_team_id: string | null;
  home_team: { name: string } | null; away_team: { name: string } | null; match_scorers: { user_id: string }[] | null;
};
type Scope = { stage_id: string | null; round_number: number | null; revision: number };
type Scorer = { user_id: string; display_name: string; roles: string[] };

const STATUSES = ['SCHEDULED', 'POSTPONED', 'CANCELLED'] as const;
const FORMAT_OPTIONS = [{ value: 'default', label: 'Stage default' }, { value: '1', label: 'Best of 1' }, { value: '2', label: 'Best of 3' }, { value: '3', label: 'Best of 5' }];
const FORMAT_LABEL: Record<number, string> = { 1: 'Best of 1', 2: 'Best of 3', 3: 'Best of 5' };

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Fixtures and scorers: set up the stage, generate fixtures, then schedule, assign scorers and record results. */
export default function OrganizerFixtures() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const logo = useLogoUrl(id);
  const [slug, setSlug] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState(0);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [scorers, setScorers] = useState<Scorer[]>([]);
  const [rulesReady, setRulesReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dates, setDates] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [planned, setPlanned] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [tn, st, m, staff, teams, rules, scopeRes, plans] = await Promise.all([
      api.from('tournaments').select('format,start_date,end_date,slug').eq('id', id).maybeSingle(),
      api.from('tournament_stages').select('id,name,stage_type,sequence,qualification_count,status,standings_rules(win_points,loss_points,draw_points,tie_break_rules)').eq('tournament_id', id).order('sequence'),
      api.from('matches').select('id,stage_id,match_number,program_order,round_number,status,sets_to_win,format_override,result_type,scheduled_at,venue,court,home_team_id,away_team_id,home_team:teams!matches_home_team_id_fkey(name),away_team:teams!matches_away_team_id_fkey(name),match_scorers(user_id)').eq('tournament_id', id).order('round_number').order('program_order'),
      api.rpc('get_tournament_staff', { p_tournament_id: id }),
      api.from('teams').select('id', { count: 'exact', head: true }).eq('tournament_id', id).eq('status', 'ACTIVE'),
      api.from('volleyball_rules').select('id').eq('tournament_id', id),
      api.from('match_order_scopes').select('stage_id,round_number,revision').eq('tournament_id', id),
      api.from('tournament_progression_plans').select('source_stage_id').eq('tournament_id', id),
    ]);
    const failure = st.error ?? m.error;
    if (failure) return setError(failure.message);
    setFormat((tn.data?.format as string | undefined) ?? null);
    setSlug((tn.data?.slug as string | undefined) ?? null);
    setDates({ start: (tn.data?.start_date as string | null | undefined) ?? null, end: (tn.data?.end_date as string | null | undefined) ?? null });
    setScopes((scopeRes.data ?? []) as Scope[]);
    setPlanned(((plans.data ?? []) as { source_stage_id: string }[]).map((x) => x.source_stage_id));
    setStages(st.data as unknown as Stage[]);
    setMatches(m.data as unknown as Match[]);
    setScorers(((staff.data ?? []) as unknown as Scorer[]).filter((s) => s.roles?.includes('SCORER')));
    setTeamCount(teams.count ?? 0);
    setRulesReady((rules.data?.length ?? 0) > 0);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /** Run one action, show its error or notice, and reload on success. */
  async function run(key: string, action: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const { error: e } = await action();
    setBusy(null);
    if (e) return setError(e.message);
    setNotice(done);
    await load();
  }

  const groups = stages
    ? [...new Set(matches.map((m) => `${m.stage_id}|${m.round_number}`))].map((key) => {
      const first = matches.find((m) => `${m.stage_id}|${m.round_number}` === key)!;
      return { stage: stages.find((x) => x.id === first.stage_id) ?? null, round: first.round_number, items: matches.filter((m) => `${m.stage_id}|${m.round_number}` === key) };
    })
    : [];
  const completeLeague = stages?.find((x) => x.stage_type === 'LEAGUE' && x.status === 'COMPLETED' && !planned.includes(x.id));

  return (
    <OrganizerFrame id={id} current="fixtures" title="Fixtures & Scorers" subtitle={name}>
      <Text style={{ color: t.textSecondary, fontSize: 15 }}>Set up the competition, generate authoritative fixtures, and manage saved schedules.</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {notice ? <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>{notice}</Text> : null}
      {!stages ? <Loading /> : (
        <>
          <Section title="Competition Structure">
            {stages.length === 0 ? <StageSetup tournamentId={id} format={format} teamCount={teamCount} busy={busy} run={run} /> : null}
            {stages.map((stage) => (
              <StageCard key={stage.id} stage={stage} count={matches.filter((m) => m.stage_id === stage.id).length} canGenerate={rulesReady} busy={busy} run={run} />
            ))}
          </Section>

          {completeLeague ? <Progression tournamentId={id} stageId={completeLeague.id} onDone={async (message) => { setNotice(message); await load(); }} /> : null}

          <Section title="Fixtures & Schedule">
            {matches.length === 0 ? <Empty text="No fixtures yet. Generate them from the stage above." /> : null}
            {matches.length > 0 ? (
              <PosterShare label="Share fixtures poster" fileName="fixtures.png" shareTitle={`${name} fixtures`}>
                <FixturesPoster tournament={{ id, name, venue: null }} logoUrl={logo} matches={matches.filter((m) => m.status !== 'COMPLETED').slice(0, 8).map((m) => ({ id: m.id, label: `ROUND ${m.round_number ?? 1} · MATCH ${m.match_number ?? '—'}`, home: m.home_team?.name ?? 'TBD', away: m.away_team?.name ?? 'TBD', when: m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null, court: m.court }))} />
              </PosterShare>
            ) : null}
            {groups.map(({ stage, round, items }) => (
              <View key={`${stage?.id}-${round}`} style={{ gap: 12 }}>
                <Text style={{ color: t.primary, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{stages.length > 1 && stage ? `${stage.name} · ` : ''}{round != null ? `Round ${round}` : 'Fixtures'}</Text>
                <RoundTools key={items.map((m) => `${m.id}${m.status}${m.scheduled_at}`).join()} tournamentId={id} stageId={stage?.id ?? null} stageName={stage?.name ?? 'Fixtures'} round={round} items={items}
                  revision={scopes.find((x) => x.stage_id === (stage?.id ?? null) && x.round_number === round)?.revision ?? null}
                  defaults={{ startDate: dates.start, endDate: dates.end, stageType: stage?.stage_type ?? format ?? 'LEAGUE', hasNextStage: stages.some((x) => x.sequence > (stage?.sequence ?? 0)) }}
                  onDone={async (message) => { setError(null); setNotice(message || null); await load(); }} />
                {items.map((m) => (
                  <MatchCard key={m.id} slug={slug} match={m} league={stage?.stage_type === 'LEAGUE'} scorers={scorers} busy={busy} run={run} />
                ))}
              </View>
            ))}
          </Section>
        </>
      )}
    </OrganizerFrame>
  );
}

type Run = (key: string, action: () => PromiseLike<{ error: { message: string } | null }>, done: string) => Promise<void>;

function StageSetup({ tournamentId, format, teamCount, busy, run }: { tournamentId: string; format: string | null; teamCount: number; busy: string | null; run: Run }) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  const [stageName, setStageName] = useState('League Stage');
  const [qualify, setQualify] = useState('4');
  const [preset, setPreset] = useState<PresetKey>('BO3');
  const [confirm, setConfirm] = useState(false);

  async function create() {
    setConfirm(false);
    await run('setup', async () => {
      const { data: stageId, error } = await api.rpc('save_tournament_stage', { p_tournament_id: tournamentId, p_stage_id: null as unknown as string, p_name: stageName, p_stage_type: format ?? 'LEAGUE', p_sequence: 1, p_qualification_count: format === 'LEAGUE' ? Number(qualify) : undefined });
      if (error) return { error };
      return api.rpc('save_volleyball_rule', presetRuleArgs(tournamentId, stageId as unknown as string, preset));
    }, 'Competition stage created.');
  }

  return (
    <View style={[portalCard(t), { gap: 12, borderStyle: 'dashed', borderColor: t.primary }]}>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>No competition stage configured.</Text>
      <Text style={{ color: t.textSecondary, fontSize: 14 }}>{format ?? 'Tournament'} · {teamCount} teams</Text>
      {!show ? <Button title="Set Up Competition" onPress={() => setShow(true)} /> : (
        <View style={{ gap: 12 }}>
          <Field label="Stage name" value={stageName} onChangeText={setStageName} placeholder="Stage name (e.g. League Stage)" />
          {format === 'LEAGUE' ? <Field label="Teams qualifying" value={qualify} onChangeText={setQualify} keyboardType="number-pad" /> : null}
          <Choice label="Match format" value={preset} options={PRESET_OPTIONS} onChange={setPreset} />
          {!confirm ? <Button title="Confirm & Create" disabled={busy !== null || stageName.trim() === ''} onPress={() => setConfirm(true)} /> : (
            <View style={{ gap: 8 }}>
              <Text style={{ color: t.textSecondary, fontSize: 14 }}>Create “{stageName}” as the first stage?</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setConfirm(false)} /></View>
                <View style={{ flex: 1 }}><Button title="Create" loading={busy === 'setup'} onPress={() => void create()} /></View>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function StageCard({ stage, count, canGenerate, busy, run }: { stage: Stage; count: number; canGenerate: boolean; busy: string | null; run: Run }) {
  const t = useTheme();
  const r = stage.standings_rules;
  const [win, setWin] = useState(String(r?.win_points ?? 2));
  const [draw, setDraw] = useState(String(r?.draw_points ?? 1));
  const [loss, setLoss] = useState(String(r?.loss_points ?? 0));
  const [ties, setTies] = useState((r?.tie_break_rules ?? ['WINS', 'SET_DIFFERENCE', 'POINT_DIFFERENCE', 'NAME']).join(','));
  return (
    <View style={[portalCard(t), { gap: 14 }]}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: t.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>{stage.stage_type} STAGE</Text>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{stage.name}</Text>
        <Text style={{ color: t.textSecondary, fontSize: 14 }}>Stage {stage.sequence} · {stage.status} · {count} fixtures{stage.qualification_count ? ` · Top ${stage.qualification_count} qualify` : ''}</Text>
      </View>
      <Button title={count ? 'Fixtures Generated' : 'Generate Fixtures'} disabled={busy !== null || count > 0 || !canGenerate} loading={busy === stage.id}
        onPress={() => void run(stage.id, () => api.rpc('generate_stage_fixtures', { p_stage_id: stage.id }), 'Fixtures generated.')} />
      {stage.stage_type === 'LEAGUE' ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14 }}>
          <Text style={{ color: t.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Points Table Rules</Text>
          <Field label="Points for a Win" value={win} onChangeText={setWin} keyboardType="number-pad" />
          <Field label="Points for a Draw" value={draw} onChangeText={setDraw} keyboardType="number-pad" />
          <Field label="Points for a Loss" value={loss} onChangeText={setLoss} keyboardType="number-pad" />
          <Field label="Tiebreaker order (comma-separated)" value={ties} onChangeText={setTies} autoCapitalize="characters" />
          <Button tone="secondary" title="Save Points Rules" loading={busy === `rules-${stage.id}`} disabled={busy !== null}
            onPress={() => void run(`rules-${stage.id}`, () => api.rpc('save_standings_rules', { p_stage_id: stage.id, p_win_points: Number(win), p_loss_points: Number(loss), p_draw_points: Number(draw), p_tie_break_rules: ties.split(',').map((s) => s.trim()).filter(Boolean) }), 'Standings rules saved.')} />
        </View>
      ) : null}
    </View>
  );
}

function MatchCard({ match, slug, league, scorers, busy, run }: { match: Match; slug: string | null; league: boolean; scorers: Scorer[]; busy: string | null; run: Run }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const home = match.home_team?.name ?? 'TBD';
  const away = match.away_team?.name ?? 'TBD';
  const scorer = match.match_scorers?.[0]?.user_id ?? '';
  const [when, setWhen] = useState(toLocalInput(match.scheduled_at));
  const [venue, setVenue] = useState(match.venue ?? '');
  const [court, setCourt] = useState(match.court ?? '');
  const [status, setStatus] = useState<string>(STATUSES.includes(match.status as (typeof STATUSES)[number]) ? match.status : 'SCHEDULED');
  const [result, setResult] = useState<'WALKOVER_HOME' | 'WALKOVER_AWAY' | 'DRAW'>('WALKOVER_HOME');
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState(false);
  const finished = match.status === 'COMPLETED';
  const locked = busy !== null;

  function saveSchedule() {
    setLocalError(null);
    const parsed = when.trim() ? new Date(when.trim().replace(' ', 'T')) : null;
    if (parsed && Number.isNaN(parsed.getTime())) return setLocalError('Use the format YYYY-MM-DD HH:MM.');
    void run(match.id, () => api.rpc('update_match_schedule', { p_match_id: match.id, p_scheduled_at: parsed ? parsed.toISOString() : (null as unknown as string), p_venue: venue, p_court: court, p_status: status }), 'Schedule updated.');
  }

  function declare() {
    setConfirmResult(false);
    void run(`result-${match.id}`, () => api.rpc('declare_match_result', {
      p_match_id: match.id, p_result_type: result === 'DRAW' ? 'DRAW' : 'WALKOVER',
      p_winner_team_id: (result === 'DRAW' ? null : result === 'WALKOVER_HOME' ? match.home_team_id : match.away_team_id) as string, p_reason: reason,
    }), 'Result recorded.');
  }

  const resultOptions = [{ value: 'WALKOVER_HOME', label: `${home} wins` }, { value: 'WALKOVER_AWAY', label: `${away} wins` }, ...(league ? [{ value: 'DRAW', label: 'Draw' }] : [])] as { value: 'WALKOVER_HOME' | 'WALKOVER_AWAY' | 'DRAW'; label: string }[];

  return (
    <View style={[portalCard(t), { gap: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>#{match.program_order} · Match {match.match_number ?? '—'}</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {match.sets_to_win ? <Text style={{ color: t.textSecondary, fontSize: 12, fontWeight: '600' }}>{FORMAT_LABEL[match.sets_to_win] ?? ''}</Text> : null}
          <StatusPill status={match.result_type && match.result_type !== 'PLAYED' ? match.result_type : match.status} />
        </View>
      </View>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{home} <Text style={{ color: t.textMuted, fontWeight: '500' }}>vs</Text> {away}</Text>
      {match.scheduled_at || match.venue ? (
        <View style={{ gap: 4 }}>
          {match.scheduled_at ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Calendar size={14} color={t.textMuted} /><Text style={{ color: t.textSecondary, fontSize: 13 }}>{new Date(match.scheduled_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text></View> : null}
          {match.venue ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><MapPin size={14} color={t.textMuted} /><Text style={{ color: t.textSecondary, fontSize: 13 }}>{match.venue}{match.court ? ` · ${match.court}` : ''}</Text></View> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button title="Score" tone="secondary" onPress={() => router.push({ pathname: '/scorer/[id]', params: { id: match.id } })} /></View>
        <View style={{ flex: 1 }}><Button title="Match view" tone="secondary" onPress={() => router.push({ pathname: '/match/[id]', params: { id: match.id } })} /></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Schedule, format, result and scorer for match ${match.match_number}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 8 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>Schedule, Format, Result & Scorer</Text>
        {open ? <ChevronUp size={18} color={t.textMuted} /> : <ChevronDown size={18} color={t.textMuted} />}
      </Pressable>
      {open ? (
        <View style={{ gap: 14 }}>
          {slug ? <QrCard title={`${home} vs ${away}`} subtitle="Scan for the live score" value={`${siteUrl}/t/${slug}/match/${match.id}`} fileName={`match-qr-${match.match_number ?? match.id}.png`} /> : null}
          <Field label="Date and time (YYYY-MM-DD HH:MM)" value={when} onChangeText={setWhen} placeholder="2026-11-01 18:30" autoCapitalize="none" />
          <Field label="Venue" value={venue} onChangeText={setVenue} />
          <Field label="Court" value={court} onChangeText={setCourt} />
          <Choice label="Status" value={status} options={STATUSES.map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }))} onChange={setStatus} />
          {localError ? <ErrorText>{localError}</ErrorText> : null}
          <Button title="Save Schedule" loading={busy === match.id} disabled={locked} onPress={saveSchedule} />

          <Choice label="Match format" value={match.format_override && match.sets_to_win ? String(match.sets_to_win) : 'default'} options={FORMAT_OPTIONS}
            onChange={(v) => void run(`fmt-${match.id}`, () => api.rpc('set_match_format', { p_match_id: match.id, p_sets_to_win: v === 'default' ? (null as unknown as number) : Number(v) }), 'Match format updated.')} />

          <Choice label="Scorer" value={scorer} options={scorers.map((s) => ({ value: s.user_id, label: s.display_name }))}
            onChange={(v) => void run(`scorer-${match.id}`, () => api.rpc('assign_match_scorer', { p_match_id: match.id, p_scorer_user_id: v }), 'Scorer assigned.')} />
          {scorers.length === 0 ? <Text style={{ color: t.textMuted, fontSize: 13 }}>No scorers yet. Add them from the website’s staff page.</Text> : null}

          <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14 }}>
            <Text style={{ color: t.textSecondary, fontSize: 13, fontWeight: '600' }}>Walkover or draw{match.result_type && match.result_type !== 'PLAYED' ? ` · currently ${match.result_type === 'DRAW' ? 'a draw' : 'a walkover'}` : ''}</Text>
            <Choice label="Result" value={result} options={resultOptions} onChange={setResult} />
            <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Reason, e.g. team did not show up" />
            {!confirmResult ? (
              <Button tone="secondary" title="Record result" disabled={locked || reason.trim() === '' || !match.home_team_id || !match.away_team_id} onPress={() => setConfirmResult(true)} />
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={{ color: t.textSecondary, fontSize: 14 }}>Record {result === 'DRAW' ? 'a draw' : `a walkover for ${result === 'WALKOVER_HOME' ? home : away}`}?{finished ? ' This replaces the score already entered.' : ''}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setConfirmResult(false)} /></View>
                  <View style={{ flex: 1 }}><Button title="Confirm" loading={busy === `result-${match.id}`} onPress={declare} /></View>
                </View>
              </View>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}
