import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrenceStarts } from '../src/calendar/recurrence.js';

const weekly = {
  all_day:true,tzid:'UTC',rrule:'FREQ=WEEKLY;BYDAY=TU',
  start_at:'2026-10-13T00:00:00Z',end_at:'2026-10-14T00:00:00Z',
};
test('a one-day Tuesday series has one occurrence on each Tuesday', () => {
  for (const day of [13,20,27]) assert.equal(occurrenceStarts(weekly,
    new Date(`2026-10-${day}T00:00:00Z`),new Date(`2026-10-${day+1}T00:00:00Z`)).length,1);
});
test('long weekly occurrences genuinely overlap; do not collapse separate instances', () => {
  const long={...weekly,end_at:'2026-11-09T00:00:00Z'};
  assert.deepEqual(occurrenceStarts(long,new Date('2026-10-20T00:00:00Z'),new Date('2026-10-21T00:00:00Z'))
    .map(date=>date.toISOString()),['2026-10-13T00:00:00.000Z','2026-10-20T00:00:00.000Z']);
});
