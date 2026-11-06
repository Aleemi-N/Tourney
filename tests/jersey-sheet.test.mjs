import assert from 'node:assert/strict';
import test from 'node:test';
import { jerseySheet } from '../src/lib/jersey-sheet.ts';

const row = (team, player, number, name, size) => ({ team, player, jerseyNumber: number, jerseyName: name, jerseySize: size });

test('the sheet lists each team\'s players by number with name and size', () => {
  const sheet = jerseySheet([
    row('Hawks', 'Ravi Kumar', '10', 'RAVI', 'L'),
    row('Eagles', 'Sam', '9', 'SAM', 'm'),
    row('Hawks', 'Asha', '2', 'ASHA', 'S'),
    row('Hawks', 'No Number', null, null, 'XL'),
  ]);
  assert.deepEqual(sheet[0], ['Team', 'Number', 'Name on jersey', 'Player', 'Size', 'Check']);
  assert.deepEqual(sheet.slice(1, 5), [
    ['Eagles', '9', 'SAM', 'Sam', 'M', ''], // sizes are upper-cased
    ['Hawks', '2', 'ASHA', 'Asha', 'S', ''],
    ['Hawks', '10', 'RAVI', 'Ravi Kumar', 'L', ''], // numbers sort as numbers: 2 before 10
    ['Hawks', '', '', 'No Number', 'XL', 'No number'], // players without a number come last in their team
  ]);
});

test('the sizes to order are counted per team and in total, in size order', () => {
  const sheet = jerseySheet([
    row('Hawks', 'A', '1', 'A', 'L'), row('Hawks', 'B', '2', 'B', 'L'), row('Hawks', 'C', '3', 'C', 'S'),
    row('Eagles', 'D', '4', 'D', 'XL'), row('Eagles', 'E', '5', 'E', null), row('Eagles', 'F', '6', 'F', 'xs'),
  ]);
  const at = sheet.findIndex((r) => r[0] === 'Sizes to order');
  assert.deepEqual(sheet[at - 1], [], 'a blank line separates the list from the order counts');
  assert.deepEqual(sheet[at], ['Sizes to order', 'XS', 'S', 'L', 'XL', 'Not given', 'Total']);
  assert.deepEqual(sheet[at + 1], ['Eagles', 1, 0, 0, 1, 1, 3]);
  assert.deepEqual(sheet[at + 2], ['Hawks', 0, 1, 2, 0, 0, 3]);
  assert.deepEqual(sheet[at + 3], ['All teams', 1, 1, 2, 1, 1, 6]);
});

test('missing details and repeated numbers within a team are flagged for the organizer', () => {
  const sheet = jerseySheet([
    row('Hawks', 'A', '7', 'A', 'M'), row('Hawks', 'B', '7', 'B', null), row('Eagles', 'C', '7', 'C', 'L'), // 7 is fine on another team
  ]);
  assert.deepEqual(sheet.slice(1, 4).map((r) => r[5]), ['', 'Number used twice', 'No size; Number used twice']);
});

test('an empty squad list still gives a valid sheet', () => {
  assert.deepEqual(jerseySheet([]), [['Team', 'Number', 'Name on jersey', 'Player', 'Size', 'Check'], [], ['Sizes to order', 'Total'], ['All teams', 0]]);
});
