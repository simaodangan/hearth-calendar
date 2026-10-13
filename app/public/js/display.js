import { t, uiLocale } from './display-locale.js';
import { get, post, setDisplayToken } from './api.js';
import { drawCountdowns } from './calendar-extras.js';
import { renderCalendar, shiftDate, viewRange, viewTitle, dayEvents, eventCard } from './calendar-view.js';
import { renderChoreBoard, toggleItem } from './chores.js';
import { nightOverlay, photoFrame, upNextStrip, weatherWidget } from './display-extras.js';
import { openEventDetails, openEventEditor } from './event-editor.js';
import { add, avatar, clear, fmtDate, h, modal, sameDay, startOfDay, toast, ymd } from './util.js';

import { loadWeekChores, renderDayChores, displayView, weekChoreSlots } from './display-chores.js';

const TOKEN_KEY = 'hearth.displayToken';
const root = document.getElementById('display');

function storage(action, key, value) {
  try {
    if (action === 'get') return localStorage.getItem(key);
    if (action === 'set') localStorage.setItem(key, value);
    if (action === 'remove') localStorage.removeItem(key);
  } catch {
    return null;
  }
  return null;
}

// The token lives in the URL fragment, which browsers never send to the server. It stays in the
// address bar so an iPad "Add to Home Screen" icon (which gets its own storage) keeps working.
const fromHash = new URLSearchParams(location.hash.slice(1)).get('token');
if (fromHash) storage('set', TOKEN_KEY, fromHash);
const ownerDisplayId = new URLSearchParams(location.search).get('displayId');
const token = fromHash || (ownerDisplayId ? null : storage('get', TOKEN_KEY));
if (token) setDisplayToken(token);

const state = {
  settings: null,
  view: 'week',
  date: new Date(),
  calendars: [],
  members: [],
  lists: [],
  checklists: [],
  mealLists: [],
  stars: null,
  events: [],
  upcoming: [],
  lastWeather: 0,
  lastPhotoList: 0,
  items: [],
  weekItems: new Map(),
  memberFilter: new Set(),
  lastInteraction: Date.now(),
  today: ymd(new Date()),
};

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function showSignedOut(message) {
  add(clear(root),
    h(
      'div',
      { class: 'auth-card center' },
      h('div', { class: 'brand big' }, h('span', { class: 'brand-mark' }, '◐'), t('Hearth Display')),
      h('p', {}, message),
      h('p', { class: 'muted' }, t('Create a display link in Settings → Wall displays and open it on this screen, or sign in to preview.')),
      h('a', { class: 'btn primary', href: '/login' }, t('Sign in')),
    ),
  );
}

const els = {};
const cals = () => new Map(state.calendars.map((c) => [c.id, c]));

function ctx() {
  const byId = cals();
  return {
    calendars: state.calendars,
    calendarsById: byId,
    membersById: new Map(state.members.map((m) => [m.id, m])),
    colorFor: (ev) => byId.get(ev.calendarId)?.color || '#8d7b6a',
    defaultCalendarId: state.calendars.find((c) => c.writable)?.id,
    allowEditing: state.settings.allowEditing,
    onChange: refreshEventViews,
  };
}

function visibleEvents() {
  const byId = cals();
  return state.events.filter((ev) => {
    const cal = byId.get(ev.calendarId);
    return cal && (!state.memberFilter.size || state.memberFilter.has(cal.memberId));
  });
}

function drawClock() {
  const now = new Date();
  els.time.textContent = now.toLocaleTimeString(uiLocale(), { hour: 'numeric', minute: '2-digit' });
  els.date.textContent = fmtDate(now, { weekday: 'long', month: 'long', day: 'numeric' });
}

function drawCalendar() {
  if (els.choreSection) els.choreSection.hidden = state.view === 'week';
  const showSide = Boolean(els.side && (state.settings.showMeals || state.settings.showLists ||
    (state.settings.showChores && state.view !== 'week')));
  if (els.side) els.side.hidden = !showSide;
  els.body.classList.toggle('with-chores', showSide);
  const c = ctx();
  const slots = weekChoreSlots(state.weekItems, state.lists, state.memberFilter, ymd(new Date()), state.members);
  els.title.textContent = viewTitle(state.view, state.date, state.settings.weekStartsOn);
  els.viewButtons.forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
  renderCalendar(els.calendar, {
    ...c,
    view: state.view,
    date: state.date,
    events: visibleEvents(),
    weekStartsOn: state.settings.weekStartsOn,
    compact: true,
    dayContent: state.view === 'week' && state.settings.showChores ? (day) => renderDayChores({
      day: ymd(day), today: ymd(new Date()), items: state.weekItems.get(ymd(day)) || [],
      lists: state.lists, members: state.members, memberFilter: state.memberFilter,
      slots,
      onToggle: async (item, done, key, button) => {
        button.disabled = true;
        try { await toggleItem(item, done, key, button); } catch {}
        await refreshAll();
      },
    }) : undefined,
    onEvent: (ev) => openEventDetails(ev, c),
    onDay: (day) => {
      const list = dayEvents(visibleEvents(), day);
      const m = modal({
        title: fmtDate(day),
        content: h(
          'div',
          { class: 'agenda-list' },
          list.length ? list.map((ev) => eventCard(ev, { ...c, now: new Date(), onEvent: (e) => (m.close(), openEventDetails(e, c)) })) : h('p', { class: 'muted' }, t('Nothing planned.')),
        ),
        actions: state.settings.allowEditing && c.defaultCalendarId ? [h('button', { class: 'btn primary', onclick: () => (m.close(), openEventEditor({ ...c, date: day })) }, t('+ Add event'))] : [],
      });
    },
  });
  const choreGroups = [...els.calendar.querySelectorAll('.d-day-chores')];
  for (const group of choreGroups) group.addEventListener('scroll', () => {
    for (const other of choreGroups) if (other !== group && other.scrollTop !== group.scrollTop) other.scrollTop = group.scrollTop;
  });
}

function drawChips() {
  const inUse = new Set(state.calendars.map((c) => c.memberId));
  const people = state.members.filter((m) => inUse.has(m.id));
  clear(els.chips);
  if (people.length < 2) return;
  add(els.chips,
    h('button', { class: `chip${state.memberFilter.size ? '' : ' on'}`, onclick: () => (state.memberFilter.clear(), drawChips(), drawCalendar()) }, t('Everyone')),
    people.map((m) =>
      h(
        'button',
        {
          class: `chip${state.memberFilter.has(m.id) ? ' on' : ''}`,
          style: { '--c': m.color },
          onclick: () => {
            if (state.memberFilter.has(m.id)) state.memberFilter.delete(m.id);
            else state.memberFilter.add(m.id);
            drawChips();
            drawCalendar();
          },
        },
        avatar(m, 'sm'),
        m.name,
      ),
    ),
  );
}

function drawChores() {
  if (!els.chores) return;
  const scroll = els.chores.scrollTop;
  requestAnimationFrame(() => (els.chores.scrollTop = scroll));
  renderChoreBoard({
    root: els.choreBoard,
    items: state.items,
    lists: state.lists,
    members: state.members,
    stars: state.stars,
    day: state.today,
    compact: true,
    preserveOrder: true,
    onToggle: async (item, done, button) => {
      await toggleItem(item, done, state.today, button).catch(() => {});
      await refreshAll();
    },
  });
}

const SLOT_NAMES = { breakfast: t('Breakfast'), lunch: t('Lunch'), dinner: t('Dinner'), snack: t('Snack') };
const SLOT_ORDER = { breakfast: 1, lunch: 2, dinner: 3, snack: 4 };

/** Today's and tomorrow's planned meals. */
function drawMeals() {
  if (!els.mealsBox) return;
  const mealListIds = new Set(state.mealLists.map((l) => l.id));
  const meals = state.items.filter((i) => mealListIds.has(i.listId));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const days = [
    [t('Today'), state.today],
    [t('Tomorrow'), ymd(tomorrow)],
  ];
  add(
    clear(els.mealsBox),
    days.map(([label, key]) => {
      const here = meals.filter((m) => m.dueDate === key).sort((a, b) => (SLOT_ORDER[a.mealSlot] || 9) - (SLOT_ORDER[b.mealSlot] || 9));
      return h(
        'div',
        { class: 'd-meal-day' },
        h('strong', {}, label),
        here.length
          ? here.map((m) => h('div', { class: 'd-meal' }, h('span', { class: 'muted' }, SLOT_NAMES[m.mealSlot] || t('Meal')), h('span', {}, m.title)))
          : h('div', { class: 'd-meal muted' }, t('Nothing planned')),
      );
    }),
  );
}

/** Grocery / to-do lists on the side panel: tap to check off, optional quick add. */
function drawChecklists() {
  if (!els.listsBox) return;
  const scroll = els.side.scrollTop;
  requestAnimationFrame(() => (els.side.scrollTop = scroll));
  clear(els.listsBox);
  if (!state.checklists.length) {
    add(els.listsBox, h('p', { class: 'muted' }, t('No lists are set to show on displays.')));
    return;
  }
  for (const list of state.checklists) {
    const canEdit = list.permission !== 'view';
    const mine = state.items.filter((i) => i.listId === list.id);
    const open = mine.filter((i) => !i.done);
    const checked = mine.length - open.length;
    const input = h('input', { type: 'text', placeholder: `添加到${list.name}…`, maxlength: 200, enterkeyhint: 'enter' });
    const form =
      canEdit && state.settings.allowEditing
        ? h(
            'form',
            {
              class: 'd-quick-add',
              onsubmit: async (e) => {
                e.preventDefault();
                const title = input.value.trim();
                if (!title) return;
                input.value = '';
                try {
                  const r = await post(`/lists/${list.id}/items`, { title });
                  const at = state.items.findIndex((i) => i.id === r.item.id);
                  if (at >= 0) state.items[at] = r.item;
                  else state.items.push(r.item);
                  drawChecklists();
                } catch (err) {
                  toast(err.message, 'error');
                }
              },
            },
            input,
            h('button', { class: 'btn primary', type: 'submit', 'aria-label': t('Add') }, '+'),
          )
        : null;
    add(
      els.listsBox,
      h(
        'section',
        { class: 'd-list', style: { '--c': list.color } },
        h('header', { class: 'd-list-head' }, h('span', { class: 'dot', style: { background: list.color } }), h('strong', { class: 'grow' }, list.name), checked ? h('small', { class: 'muted' }, `✓ ${checked}`) : null),
        open.length
          ? h(
              'ul',
              { class: 'd-list-items' },
              open.map((item) =>
                h(
                  'li',
                  {},
                  h(
                    'button',
                    {
                      class: 'd-list-item',
                      disabled: !canEdit,
                      onclick: async (e) => {
                        e.currentTarget.classList.add('done');
                        item.done = true;
                        try {
                          await post(`/items/${item.id}/complete`, { done: true });
                        } catch (err) {
                          item.done = false;
                          toast(err.message, 'error');
                        }
                        setTimeout(drawChecklists, 450);
                      },
                    },
                    h('span', { class: 'check' }, '✓'),
                    h('span', {}, item.title),
                  ),
                ),
              ),
            )
          : h('p', { class: 'muted d-list-empty' }, t('All done!')),
        form,
      ),
    );
  }
}

/** Events in the next 24 hours, for the "Up next" strip (independent of the calendar view). */
async function refreshUpcoming() {
  if (!els.upNext) return;
  const now = new Date();
  try {
    const { events } = await get(`/events?display=1&from=${encodeURIComponent(startOfDay(now).toISOString())}&to=${encodeURIComponent(new Date(now.getTime() + 24 * 3600000).toISOString())}`);
    state.upcoming = events;
  } catch {
    /* keep the previous list */
  }
  drawUpNext();
}

function drawUpNext() {
  if (!els.upNext) return;
  const byId = cals();
  const visible = state.upcoming.filter((ev) => {
    const cal = byId.get(ev.calendarId);
    return cal && (!state.memberFilter.size || state.memberFilter.has(cal.memberId));
  });
  els.upNext.update(visible, ctx());
}

async function refreshEventViews() {
  await Promise.all([
    refreshEvents(),
    refreshUpcoming(),
    els.countdowns ? drawCountdowns(els.countdowns, ctx().colorFor, '?display=1') : Promise.resolve(),
  ]);
}

async function refreshEvents() {
  const { start, end } = viewRange(state.view, state.date, state.settings.weekStartsOn);
  try {
    const view = state.view;
    const anchor = ymd(state.date);
    const [result, weekItems] = await Promise.all([
      get(`/events?display=1&from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`),
      view === 'week' && state.settings.showChores ? loadWeekChores(start) : Promise.resolve(new Map()),
    ]);
    if (state.view !== view || ymd(state.date) !== anchor) return;
    state.events = result.events;
    state.weekItems = weekItems;
    els.status.hidden = true;
  } catch (err) {
    handleError(err);
  }
  drawCalendar();
}

async function refreshAll() {
  state.today = ymd(new Date());
  try {
    const [c, m, l] = await Promise.all([get('/calendars?display=1'), get('/members'), get('/lists?display=1')]);
    state.calendars = c.calendars;
    state.members = m.members;
    state.lists = l.lists.filter((list) => list.kind !== 'checklist');
    state.checklists = l.lists.filter((list) => list.kind === 'checklist');
    state.mealLists = l.lists.filter((list) => list.kind === 'meals');
    state.lists = l.lists.filter((list) => list.kind === 'chores');
    const s = state.settings;
    if (s.showChores || s.showLists || s.showMeals) state.items = (await get(`/items?display=1&day=${state.today}`)).items;
    if (s.showChores) state.stars = (await get('/stars').catch(() => ({ balances: null }))).balances;
    els.status.hidden = true;
  } catch (err) {
    handleError(err);
  }
  await refreshUpcoming();
  if (els.countdowns) drawCountdowns(els.countdowns, ctx().colorFor, '?display=1');
  if (els.weather && Date.now() - state.lastWeather > 10 * 60000) {
    state.lastWeather = Date.now();
    els.weather.refresh();
  }
  if (els.photos && Date.now() - state.lastPhotoList > 30 * 60000) {
    state.lastPhotoList = Date.now();
    els.photos.loadList();
  }
  drawChips();
  const typing = els.listsBox?.contains(document.activeElement) && document.activeElement.value;
  drawChores();
  drawMeals();
  if (!typing) drawChecklists();
  await refreshEvents();
}

function handleError(err) {
  if (err.status === 401) {
    storage('remove', TOKEN_KEY);
    showSignedOut(t('This display link is no longer valid.'));
    throw err;
  }
  els.status.textContent = `离线 — 正在显示已保存的数据（${err.message}）`;
  els.status.hidden = false;
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    /* not supported or not allowed yet */
  }
}

function build() {
  const s = state.settings;
  const go = (dir) => {
    state.date = dir === 0 ? new Date() : shiftDate(state.view, state.date, dir);
    refreshEvents();
  };
  els.time = h('span', { class: 'd-time' });
  els.date = h('span', { class: 'd-date' });
  els.title = h('span', { class: 'd-range' });
  els.chips = h('div', { class: 'chips' });
  els.calendar = h('div', { class: 'calendar-root d-calendar' });
  els.status = h('div', { class: 'd-status', hidden: true });
  els.weather = s.showWeather ? weatherWidget() : null;
  els.upNext = s.showUpNext ? upNextStrip() : null;
  els.countdowns = s.showCountdowns ? h('div', { class: 'countdowns d-countdowns', hidden: true }) : null;
  els.night = s.nightMode ? nightOverlay(s) : null;
  els.photos = s.photoFrame ? photoFrame(s, { idleMs: () => s.photoIdleMinutes * 60000 }) : null;
  els.viewButtons = [
    ['month', t('Month')],
    ['week', t('Week')],
    ['agenda', t('Schedule')],
  ].map(([v, label]) =>
    h(
      'button',
      {
        dataset: { view: v },
        onclick: () => {
          state.view = v;
          state.date = new Date();
          refreshEvents();
        },
      },
      label,
    ),
  );
  if (s.showChores || s.showLists || s.showMeals) {
    els.choreBoard = s.showChores ? h('div', {}) : null;
    els.listsBox = s.showLists ? h('div', { class: 'd-lists' }) : null;
    els.mealsBox = s.showMeals ? h('div', { class: 'd-meals' }) : null;
    els.choreSection = s.showChores ? h('section', { class: 'd-section', hidden: state.view === 'week' },
      h('h2', { class: s.showMeals ? 'd-section-gap' : '' }, t('Today’s chores')), els.choreBoard) : null;
    els.side = h(
      'aside',
      { class: 'd-chores' },
      s.showMeals ? h('section', { class: 'd-section' }, h('h2', {}, t('🍽 Meals')), els.mealsBox) : null,
      els.choreSection,
      s.showLists ? h('section', { class: 'd-section' }, h('h2', { class: s.showChores || s.showMeals ? 'd-section-gap' : '' }, t('Lists')), els.listsBox) : null,
    );
    els.chores = s.showChores ? els.side : null;
  }

  add(clear(root),
    h(
      'header',
      { class: 'd-top' },
      h('div', { class: 'd-clock' }, els.time, els.date, els.weather?.el),
      h(
        'div',
        { class: 'd-controls' },
        h('div', { class: 'row gap-s d-date-nav' }, h('button', { class: 'icon-btn', 'aria-label': t('Previous'), onclick: () => go(-1) }, '‹'), h('button', { class: 'btn d-today', onclick: () => go(0) }, t('Today')), h('button', { class: 'icon-btn', 'aria-label': t('Next'), onclick: () => go(1) }, '›'), els.title),
        h('div', { class: 'segmented' }, els.viewButtons),
        s.allowEditing ? h('button', { class: 'btn primary', onclick: () => openEventEditor({ ...ctx() }) }, t('+ Event')) : null,
        document.fullscreenEnabled
          ? h('button', { class: 'icon-btn', 'aria-label': t('Full screen'), title: t('Full screen'), onclick: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}) }, '⛶')
          : null,
      ),
    ),
    h('div', { class: 'd-sub' }, els.upNext?.el, els.countdowns, els.chips, els.status),
    els.body = h('div', { class: `d-body${els.side ? ' with-chores' : ''}` }, els.calendar, els.side),
    els.photos?.el,
    els.night?.el,
  );
}

async function boot() {
  let session;
  try {
    session = await get(`/display/session${ownerDisplayId ? `?displayId=${encodeURIComponent(ownerDisplayId)}` : ''}`);
  } catch (err) {
    showSignedOut(err.status === 401 ? (token ? t('This display link is no longer valid.') : t('This screen is not set up yet.')) : err.message);
    if (err.status === 401) storage('remove', TOKEN_KEY);
    return;
  }
  state.settings = session.settings;
  state.settings.view = displayView(session.settings.view);
  state.view = state.settings.view;
  applyTheme(session.settings.theme);
  document.title = session.display ? `${session.display.name} · Hearth` : t('Hearth Display (preview)');
  build();
  drawClock();
  await refreshAll().catch(() => {});

  setInterval(() => {
    drawClock();
    const night = els.night ? els.night.tick() : false;
    els.photos?.tick(state.lastInteraction, night || Boolean(document.querySelector('.backdrop')));
  }, 1000);
  setInterval(() => {
    const today = ymd(new Date());
    // After a few idle minutes, drift back to today's default view.
    const idle = Date.now() - state.lastInteraction > 5 * 60 * 1000 && !document.querySelector('.backdrop');
    if (today !== state.today || (idle && (!sameDay(state.date, new Date()) || state.view !== state.settings.view))) {
      state.today = today;
      state.date = new Date();
      state.view = state.settings.view;
    }
    refreshAll().catch(() => {});
  }, 60 * 1000);

  for (const evt of ['pointerdown', 'keydown']) {
    document.addEventListener(evt, () => {
      state.lastInteraction = Date.now();
      keepAwake();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      keepAwake();
      refreshAll().catch(() => {});
    }
  });
  keepAwake();
  window.addEventListener('offline', () => toast(t('Connection lost — will keep retrying.'), 'error'));
}

boot();
