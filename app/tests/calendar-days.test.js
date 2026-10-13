import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketByDay, dayEvents } from '../public/js/calendar-view.js';

const timed = (id, start, end) => ({ id, title:id, allDay:false, start:start.toISOString(), end:end.toISOString() });
const at = (day, hour = 0) => new Date(2026, 9, day, hour);

test('day details exclude history, future events and exclusive midnight ends', () => {
  const events = [
    timed('history',at(10,12),at(10,13)),
    timed('ends-at-midnight',at(12,20),at(13)),
    timed('today',at(13,10),at(13,11)),
    timed('ongoing',at(12,20),at(13,2)),
    timed('future',at(14),at(14,1)),
    {id:'all-day-before',title:'before',allDay:true,start:'2026-10-12',end:'2026-10-13'},
    {id:'all-day-today',title:'today',allDay:true,start:'2026-10-13',end:'2026-10-14'},
  ];
  assert.deepEqual(new Set(dayEvents(events,at(13)).map(e=>e.id)),new Set(['today','ongoing','all-day-today']));
  assert.equal(dayEvents(events,at(15)).length,0);
});
test('zero-duration events stay on their actual day', () => {
  const events=[timed('past-point',at(12,12),at(12,12)),timed('today-point',at(13),at(13))];
  assert.deepEqual(dayEvents(events,at(13)).map(e=>e.id),['today-point']);
});
test('shared month/week bucketing preserves genuine multi-day overlaps', () => {
  const map=bucketByDay([timed('spanning',at(12,22),at(14,1))],at(13),at(15));
  assert.deepEqual([...map.keys()],['2026-10-13','2026-10-14']);
  assert.equal(map.get('2026-10-13')[0]._continues,true);
});
