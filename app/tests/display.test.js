import test from 'node:test';
import assert from 'node:assert/strict';
import { displayView, isDueOn, loadWeekChores, weekChoreSlots } from '../public/js/display-chores.js';
import { fmtDate, fmtTime, weekdayNames, memberGlyph } from '../public/js/util.js';
import { t } from '../public/js/display-locale.js';
import { viewTitle } from '../public/js/calendar-view.js';

test('old Day defaults fall back to Week; other supported views remain', () => {
  assert.equal(displayView('day'), 'week');
  for (const view of ['month', 'week', 'agenda']) assert.equal(displayView(view), view);
});
test('exact due dates, recurrence start dates and undated chores', () => {
  assert.equal(isDueOn({ dueDate: '2026-10-13' }, '2026-10-14', '2026-10-13'), false);
  assert.equal(isDueOn({ dueDate: '2026-10-13', done: true }, '2026-10-13', '2026-10-13'), true);
  assert.equal(isDueOn({}, '2026-10-13', '2026-10-13'), true);
  assert.equal(isDueOn({}, '2026-10-14', '2026-10-13'), false);
  const recurring = { repeatDays: 4, dueDate: '2026-10-13' }; // Tuesday
  assert.equal(isDueOn(recurring, '2026-10-06', '2026-10-13'), false);
  assert.equal(isDueOn(recurring, '2026-10-13', '2026-10-13'), true);
  assert.equal(isDueOn(recurring, '2026-10-14', '2026-10-13'), false);
});
test('each day gets independent completion data, including across month boundary', async () => {
  const result = await loadWeekChores(new Date(2026, 9, 29), async path => ({ items: [{ done: path.endsWith('2026-11-01') }] }));
  assert.equal(result.size, 7);
  assert.equal(result.get('2026-11-01')[0].done, true);
  assert.equal(result.get('2026-10-31')[0].done, false);
  assert.ok(result.has('2026-11-04'));
  await assert.rejects(loadWeekChores(new Date(), async () => { throw new Error('offline'); }), /offline/);
});
test('every possible weekday selection excludes all unselected days', () => {
  for (let mask = 1; mask <= 127; mask++) {
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = `2026-10-${String(11 + weekday).padStart(2, '0')}`; // Sunday through Saturday
      assert.equal(isDueOn({ repeatDays: mask }, day, '2026-10-13'), Boolean(mask & (1 << weekday)));
    }
  }
});
test('shared weekly rows stay fixed when completion changes or a day has no chore', () => {
  const weekly = new Map([
    ['2026-10-12', [{ id:'a', listId:'l', repeatDays:2, done:false }, { id:'b',listId:'l',repeatDays:127 }]],
    ['2026-10-13', [{ id:'b',listId:'l',repeatDays:127 }]],
  ]);
  const lists=[{id:'l'}];
  assert.deepEqual(weekChoreSlots(weekly,lists,new Set(),'2026-10-13'),['a','b']);
  weekly.get('2026-10-12')[0].done=true;
  assert.deepEqual(weekChoreSlots(weekly,lists,new Set(),'2026-10-13'),['a','b']);
});
test('Chinese display dates and labels; main app labels unchanged', () => {
  globalThis.document = { documentElement: { lang: 'zh-CN' } };
  assert.equal(t('Week'), '周');
  assert.match(fmtDate(new Date(2026, 9, 13)), /10月13日/);
  assert.equal(fmtDate(new Date(2026, 9, 13), {year:'numeric',month:'long',day:'numeric'}), '2026/10/13');
  assert.equal(viewTitle('week',new Date(2026,9,13),1),'2026/10/12');
  assert.equal(viewTitle('month',new Date(2026,9,13),1),'2026/10');
  assert.equal(fmtTime(new Date(2026, 9, 13, 14, 0)), '14:00');
  assert.equal(weekdayNames(0)[0], '周日');
  document.documentElement.lang = 'en';
  assert.equal(t('Week'), 'Week');
  delete globalThis.document;
});
test('member icons prefer emoji, otherwise use the final name character', () => {
  assert.equal(memberGlyph({name:'李松'}),'松');
  assert.equal(memberGlyph({name:' 李松 ',emoji:'🐼'}),'🐼');
  assert.equal(memberGlyph({name:'李𠮷'}),'𠮷');
  assert.equal(memberGlyph({name:'Alex'}),'X');
  assert.equal(memberGlyph({name:' '}),'?');
});
test('weekly rows group chores by member, leave unassigned last and ignore completion', () => {
  const items=[
    {id:'b',listId:'l',memberId:'second',repeatDays:127},
    {id:'unassigned',listId:'l',repeatDays:127},
    {id:'a',listId:'l',memberId:'first',repeatDays:127,done:true},
    {id:'a2',listId:'l',memberId:'first',repeatDays:127},
  ];
  assert.deepEqual(weekChoreSlots(new Map([['2026-10-13',items]]),[{id:'l'}],new Set(),'2026-10-13',
    [{id:'first'},{id:'second'}]),['a','a2','b','unassigned']);
});
