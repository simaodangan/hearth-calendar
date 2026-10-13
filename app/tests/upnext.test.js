import test from 'node:test';
import assert from 'node:assert/strict';
import { todayAllDayEvents } from '../public/js/display-extras.js';

test('all-day reminders include every event covering today, with exclusive end dates', () => {
  const events = [
    {id:'today',allDay:true,start:'2026-10-13',end:'2026-10-14'},
    {id:'today2',allDay:true,start:'2026-10-13',end:'2026-10-14'},
    {id:'spanning',allDay:true,start:'2026-10-11',end:'2026-10-15'},
    {id:'yesterday',allDay:true,start:'2026-10-12',end:'2026-10-13'},
    {id:'tomorrow',allDay:true,start:'2026-10-14',end:'2026-10-15'},
    {id:'timed',allDay:false,start:'2026-10-13',end:'2026-10-14'},
  ];
  for (const hour of [0,12,23]) assert.deepEqual(
    todayAllDayEvents(events,new Date(2026,9,13,hour)).map(event=>event.id),['today','today2','spanning']);
});
