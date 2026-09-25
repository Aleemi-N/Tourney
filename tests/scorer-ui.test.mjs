import assert from 'node:assert/strict';

// Helper pure functions extracted from ScorerMatchClient logic
function getActiveSet(sets) {
  return sets.find((s) => s.status === 'PENDING' || s.status === 'LIVE') ?? sets[sets.length - 1];
}

function calcSetsWon(sets, teamId) {
  return sets.filter((s) => s.winner_team_id === teamId).length;
}

function canUndo(matchStatus, sets) {
  if (matchStatus === 'COMPLETED') return false;
  return sets.some(s => s.home_score > 0 || s.away_score > 0);
}

// Tests
console.log('--- ScorerMatchClient Logic Tests ---');

try {
  const sets1 = [
    { id: '1', set_number: 1, target_points: 25, home_score: 25, away_score: 20, status: 'COMPLETED', winner_team_id: 'home' },
    { id: '2', set_number: 2, target_points: 25, home_score: 10, away_score: 15, status: 'LIVE', winner_team_id: null },
    { id: '3', set_number: 3, target_points: 15, home_score: 0, away_score: 0, status: 'PENDING', winner_team_id: null },
  ];

  // Test active set finding
  assert.equal(getActiveSet(sets1).id, '2', 'Should find LIVE set as active');

  // Test sets won calculation
  assert.equal(calcSetsWon(sets1, 'home'), 1, 'Home won 1 set');
  assert.equal(calcSetsWon(sets1, 'away'), 0, 'Away won 0 sets');

  // Test undo visibility
  assert.equal(canUndo('LIVE', sets1), true, 'Should allow undo if match is LIVE and scores > 0');

  const setsNew = [
    { id: '1', set_number: 1, target_points: 25, home_score: 0, away_score: 0, status: 'PENDING', winner_team_id: null },
  ];
  assert.equal(canUndo('SCHEDULED', setsNew), false, 'Cannot undo if no points scored');

  assert.equal(canUndo('COMPLETED', sets1), false, 'Cannot undo if match COMPLETED');

  const setsCompleted = [
    { id: '1', set_number: 1, target_points: 25, home_score: 25, away_score: 20, status: 'COMPLETED', winner_team_id: 'home' },
  ];
  assert.equal(getActiveSet(setsCompleted).id, '1', 'Should fallback to last completed set if none pending/live');

  console.log('PASS: ScorerMatchClient Logic');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
