export const PRESETS = {
  BO1: { label: 'Best of 1', setsToWin: 1, sets: [25] },
  BO3: { label: 'Best of 3', setsToWin: 2, sets: [25, 25, 15] },
  BO5: { label: 'Best of 5', setsToWin: 3, sets: [25, 25, 25, 25, 15] },
};
export type PresetKey = keyof typeof PRESETS;
export const PRESET_OPTIONS = (Object.keys(PRESETS) as PresetKey[]).map((key) => ({ value: key, label: PRESETS[key].label }));

/** Same arguments as the web's presetRuleArgs for save_volleyball_rule. */
export function presetRuleArgs(tournamentId: string, stageId: string | null, key: PresetKey) {
  const preset = PRESETS[key];
  return {
    p_tournament_id: tournamentId,
    p_stage_id: stageId as string,
    p_sets_to_win: preset.setsToWin,
    p_win_by_two: true,
    p_set_rules: preset.sets.map((target_points, index) => ({ set_number: index + 1, target_points })) as unknown as string,
  };
}

export function detectPreset(setsToWin: number): PresetKey {
  return setsToWin === 1 ? 'BO1' : setsToWin === 3 ? 'BO5' : 'BO3';
}
