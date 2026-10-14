import { get } from './api.js';
import { addDays, confirmDialog, h, memberGlyph, parseYmd, readableText, ymd } from './util.js';

export const displayView = (view) => ['month', 'week', 'agenda'].includes(view) ? view : 'week';

// Alpha compositing provides the same 15% tint without requiring CSS color-mix().
export function choreTint(color) {
  const hex = /^#[0-9a-f]{6}$/i.test(color || '') ? color.slice(1) : '8d7b6a';
  const rgb = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${rgb.join(', ')}, 0.15)`;
}

// Unlike the sidebar's overdue board, a week cell shows chores due on that exact day.
// Undated chores stay on today's board; repeating chores respect their start date.
export function isDueOn(item, day, today) {
  if (item.repeatDays) return (!item.dueDate || item.dueDate <= day) && Boolean(item.repeatDays & (1 << parseYmd(day).getDay()));
  return item.dueDate ? item.dueDate === day : day === today;
}

export async function loadWeekChores(start, request = get) {
  return new Map(await Promise.all(Array.from({ length: 7 }, async (_, i) => {
    const day = ymd(addDays(start, i));
    const { items } = await request(`/items?display=1&day=${day}`);
    return [day, items];
  })));
}

// Each chore keeps one shared row across the week, even on days when it is not due.
export function weekChoreSlots(weekItems, lists, memberFilter, today, members = []) {
  const listIds = new Set(lists.map(l => l.id));
  const slots = new Set();
  const order = new Set();
  const byId = new Map();
  for (const [day, items] of weekItems) for (const item of items) {
    if (!listIds.has(item.listId) || (memberFilter.size && !memberFilter.has(item.memberId))) continue;
    order.add(item.id);
    if (!byId.has(item.id)) byId.set(item.id, item);
    if (isDueOn(item, day, today)) slots.add(item.id);
  }
  const memberOrder = new Map(members.map((member, index) => [member.id, index]));
  return [...order].filter(id => slots.has(id)).sort((a, b) =>
    (memberOrder.get(byId.get(a).memberId) ?? members.length) -
    (memberOrder.get(byId.get(b).memberId) ?? members.length));
}

export function renderDayChores({ day, today, items, lists, members, memberFilter, onToggle, slots }) {
  const byList = new Map(lists.map(l => [l.id, l]));
  const byMember = new Map(members.map(m => [m.id, m]));
  const due = items.filter(item => byList.has(item.listId) && isDueOn(item, day, today) &&
    (!memberFilter.size || memberFilter.has(item.memberId)));
  const byId = new Map(due.map(item => [item.id, item]));
  const rows = slots || due.map(item => item.id);
  if (!rows.length) return null;
  return h('div', { class: 'd-day-chores' }, rows.map(id => {
    const item = byId.get(id);
    if (!item) return h('div', { class: 'd-day-chore-gap', 'aria-hidden': 'true' });
    const member = byMember.get(item.memberId);
    let lastTap = 0;
    return h('button', {
      class: `d-day-chore${item.done ? ' done' : ''}`,
      dataset: { choreId: item.id, day },
      title: `${item.title}${member ? `（${member.name}）` : ''} · ${day === ymd(new Date()) ? '单击修改' : '双击后确认修改'}`,
      style: { '--c': member?.color || '#8d7b6a', '--chore-tint': choreTint(member?.color) },
      disabled: byList.get(item.listId).permission === 'view',
      'aria-pressed': String(item.done),
      'aria-label': `${day === ymd(new Date()) ? '单击' : '双击'}${item.done ? '取消完成' : '标记完成'}：${item.title}${member ? `（${member.name}）` : ''}，${day}`,
      onclick: async e => {
        e.stopPropagation();
        const button = e.currentTarget;
        if (button.disabled) return;
        if (day === ymd(new Date())) {
          button.disabled = true;
          try { await onToggle(item, !item.done, day, button); }
          finally { button.disabled = false; }
          return;
        }
        const now = Date.now();
        // Two quick clicks/taps, or keyboard activation, open confirmation only.
        if (e.detail !== 0 && (!lastTap || now - lastTap > 450)) {
          lastTap = now;
          return;
        }
        lastTap = 0;
        button.disabled = true;
        const done = !item.done;
        try {
          const confirmed = await confirmDialog(
            `将 ${day.replaceAll('-', '/')} 的“${item.title}”${done ? '标记为完成' : '取消完成'}？`,
            { title: '确认修改家务', okLabel: '确认修改' },
          );
          if (confirmed) await onToggle(item, done, day, button);
        } finally {
          button.disabled = false;
        }
      },
    }, h('span', { class: 'd-day-chore-icons', 'aria-hidden': 'true',
      style: { color: readableText(member?.color || '#8d7b6a') } },
      h('span', { class: 'ce-member' }, member ? memberGlyph(member) : '★')),
    h('span', { class: 'd-day-chore-title' }, item.title),
    h('span', { class: 'd-day-chore-done-mark', 'aria-hidden': 'true' }, item.done ? '✓' : '○'));
  }));
}
