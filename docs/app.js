'use strict';

// ===========================================================================
// Settings and fixed lists
// ===========================================================================
const STORAGE_KEY = 'gymapp.v1';
const REST_SECONDS = 90;

// Role of each exercise in a full-body session (the "slot" in exercises.json).
const SLOT_LABELS = {
  cardio: 'Cardio',
  piernas: 'Piernas',
  empuje: 'Empuje (pecho)',
  traccion: 'Tracción (espalda)',
  hombros: 'Hombros',
  brazos: 'Brazos',
  core: 'Core',
  metabolico: 'Final metabólico',
};
const SLOT_ORDER = Object.keys(SLOT_LABELS);

// The recipe for "Full body": how many exercises of each slot, in this order.
const FULL_BODY = [['cardio', 1], ['piernas', 2], ['empuje', 1], ['traccion', 1], ['hombros', 1], ['core', 1], ['metabolico', 1]];

const GROUPS = ['Piernas', 'Glúteos', 'Pecho', 'Espalda', 'Hombros', 'Brazos', 'Core', 'Cardio'];
const FORMAT_LABELS = { emom: 'EMOM', tabata: 'Tabata' };

const ICONS = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
};

// ===========================================================================
// Data: the routine (read-only) and your logs (saved on this device)
// ===========================================================================
let ROUTINE = null;   // contents of data/exercises.json
let EX = {};          // exercises by id, e.g. EX['sentadilla']

// Everything that must survive closing the app lives in `state`.
let state = loadState();

// Things that only matter while the app is open.
const ui = { sheet: null, openSession: null, pickFilter: null };
const rest = { endsAt: 0, overAt: 0 };

function loadState() {
  const fallback = { sessions: [], active: null, prefs: { tab: 'today', sort: 'day', filter: null }, lastBackup: null };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...fallback, ...saved, prefs: { ...fallback.prefs, ...saved.prefs } } : fallback;
  } catch {
    return fallback;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('No se pudo guardar en este dispositivo');
  }
}

// ===========================================================================
// Small helpers
// ===========================================================================
const $ = (sel) => document.querySelector(sel);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtShort(iso) {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}
function minutesBetween(a, b) {
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000));
}
function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// "12-10-8" with 3 sets -> [12, 10, 8]; "10" -> [10, 10, 10]; "250 m" -> [250 ...]
function targetsFor(ex, count) {
  const parts = ex.reps.split('-').map((p) => parseInt(p, 10));
  const pyramid = parts.length > 1 && parts.length === ex.sets && parts.every(Number.isFinite);
  const first = parseInt(ex.reps, 10);
  return Array.from({ length: count }, (_, i) => (pyramid ? parts[Math.min(i, parts.length - 1)] : Number.isFinite(first) ? first : ''));
}

function prescription(ex) {
  return `${ex.sets} × ${ex.reps}`;
}

// ===========================================================================
// History lookups
// ===========================================================================

// All finished sessions that include an exercise, newest first.
function entriesFor(exId) {
  const out = [];
  for (const s of state.sessions) {
    for (const item of s.items) {
      if (item.exId !== exId) continue;
      const sets = item.sets.filter((x) => x.done);
      if (sets.length) out.push({ date: s.startedAt, sets });
    }
  }
  return out.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function lastDone(exId) {
  const e = entriesFor(exId)[0];
  return e ? new Date(e.date).getTime() : 0;
}

function setText(ex, set) {
  if (ex.log === 'distance') return [set.m && `${set.m} m`, set.time && (set.time.includes(':') ? set.time : `${set.time}″`)].filter(Boolean).join(' en ') || '✓';
  if (ex.log === 'time') return set.sec ? `${set.sec}″` : '✓';
  if (set.kg && set.reps) return `${set.kg}×${set.reps}`;
  if (set.kg) return `${set.kg} kg`;
  if (set.reps) return `${set.reps} reps`;
  return '✓';
}

function setsText(ex, sets) {
  return sets.map((s) => setText(ex, s)).join(' · ');
}

// The number that best shows progress for one session, used by the chart.
function bestValue(ex, sets) {
  const nums = (key) => sets.map((s) => parseFloat(String(s[key]).replace(',', '.'))).filter(Number.isFinite);
  if (ex.log === 'time') return Math.max(0, ...nums('sec')) || null;
  if (ex.log === 'distance') return Math.max(0, ...nums('m')) || null;
  const kg = nums('kg');
  return kg.length ? Math.max(...kg) : Math.max(0, ...nums('reps')) || null;
}

// ===========================================================================
// Building sessions
// ===========================================================================
function newItem(exId) {
  const ex = EX[exId];
  return { exId, sets: Array.from({ length: ex.sets }, () => ({ done: false })) };
}

function startSession(title, exIds) {
  state.active = { id: uid(), title, startedAt: new Date().toISOString(), items: exIds.map(newItem) };
  state.prefs.tab = 'today';
  save();
  render();
  window.scrollTo(0, 0);
}

// Least recently done first; exercises never done come first of all.
// Ties are broken at random so the full body changes from day to day.
function byLeastRecent(ids) {
  return ids
    .map((id) => ({ id, t: lastDone(id), r: Math.random() }))
    .sort((a, b) => a.t - b.t || a.r - b.r)
    .map((x) => x.id);
}

function buildFullBody() {
  const picked = [];
  for (const [slot, count] of FULL_BODY) {
    const options = ROUTINE.exercises.filter((ex) => ex.slot === slot).map((ex) => ex.id);
    picked.push(...byLeastRecent(options).slice(0, count));
  }
  return picked;
}

// Swap one exercise for another with the same role that is not in the session yet.
function swapItem(index) {
  const items = state.active.items;
  const current = EX[items[index].exId];
  const inSession = new Set(items.map((it) => it.exId));
  const options = ROUTINE.exercises.filter((ex) => ex.slot === current.slot && !inSession.has(ex.id)).map((ex) => ex.id);
  if (!options.length) return toast(`No hay otro ejercicio de ${SLOT_LABELS[current.slot]}`);
  items[index] = newItem(byLeastRecent(options)[0]);
  save();
  render();
}

function addToSession(exId) {
  if (!state.active) {
    startSession('Personalizado', [exId]);
    toast(`Entreno empezado con ${EX[exId].name}`);
    return;
  }
  state.active.items.push(newItem(exId));
  save();
  render();
  toast(`Añadido: ${EX[exId].name}`);
}

function finishSession() {
  const s = state.active;
  const doneSets = s.items.reduce((n, it) => n + it.sets.filter((x) => x.done).length, 0);
  if (!doneSets) {
    if (confirm('No marcaste ninguna serie. ¿Descartar este entreno?')) discardSession(true);
    return;
  }
  if (!confirm('¿Terminar y guardar el entreno?')) return;
  s.finishedAt = new Date().toISOString();
  // Keep only exercises where at least one set was done.
  s.items = s.items.filter((it) => it.sets.some((x) => x.done));
  state.sessions.unshift(s);
  state.active = null;
  state.prefs.tab = 'history';
  ui.openSession = s.id;
  stopRest();
  save();
  render();
  window.scrollTo(0, 0);
  toast('Entreno guardado 💪');
}

function discardSession(skipConfirm) {
  if (!skipConfirm && !confirm('¿Descartar el entreno actual? Se perderán las series de hoy.')) return;
  state.active = null;
  stopRest();
  save();
  render();
}

// ===========================================================================
// Rest timer
// ===========================================================================
let audio;
function unlockAudio() {
  // iPhone only lets a page play sound after a tap, so we prepare it on tap.
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no sound available */ }
}
function beep() {
  if (!audio) return;
  [0, 0.25].forEach((delay) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, audio.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(audio.currentTime + delay);
    osc.stop(audio.currentTime + delay + 0.2);
  });
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function startRest(seconds = REST_SECONDS) {
  rest.endsAt = Date.now() + seconds * 1000;
  rest.overAt = 0;
  tick();
}
function stopRest() {
  rest.endsAt = 0;
  $('#rest').hidden = true;
}

// Runs 4 times per second: updates the rest timer and the session clock.
function tick() {
  const el = $('#rest');
  if (rest.endsAt) {
    const left = (rest.endsAt - Date.now()) / 1000;
    if (left <= 0 && !rest.overAt) {
      rest.overAt = Date.now();
      beep();
    }
    if (rest.overAt && Date.now() - rest.overAt > 4000) {
      stopRest();
    } else {
      el.hidden = false;
      el.classList.toggle('over', left <= 0);
      el.innerHTML = left > 0
        ? `<span class="small">Descanso</span><span class="time">${fmtClock(left)}</span>
           <button data-act="rest-add">+15</button><button data-act="rest-stop" aria-label="Cerrar">✕</button>`
        : `<span class="time">¡Vamos!</span><button data-act="rest-stop" aria-label="Cerrar">✕</button>`;
    }
  }
  const clock = $('#elapsed');
  if (clock && state.active) clock.textContent = `${minutesBetween(state.active.startedAt, new Date())} min`;
}
setInterval(tick, 250);

// ===========================================================================
// Views
// ===========================================================================
function render() {
  const tab = state.prefs.tab;
  document.querySelectorAll('.tabbar button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const titles = { today: state.active ? state.active.title : 'Entrenar', library: 'Ejercicios', history: 'Historial' };
  $('#title').textContent = titles[tab];
  $('#topaction').innerHTML = tab === 'today' && state.active
    ? '<button class="btn primary small" data-act="finish">Terminar</button>'
    : '';
  const views = { today: state.active ? viewSession : viewStart, library: viewLibrary, history: viewHistory };
  $('#main').innerHTML = views[tab]();
  renderSheet();
}

// ---------- Entrenar: no session yet ----------
function viewStart() {
  const days = Object.entries(ROUTINE.days).map(([day, note]) => `
    <button class="btn" data-act="start-day" data-day="${day}">Día ${day}<small>${esc(note)}</small></button>`).join('');
  const last = state.sessions[0];
  return `
    <div class="card hero-card">
      <h2 style="margin:0">Full body de hoy</h2>
      <p>${FULL_BODY.reduce((n, [, c]) => n + c, 0)} ejercicios: cardio, piernas, empuje, tracción, hombros, core y un final.
      Elige primero los que hace más tiempo que no haces.</p>
      <button class="btn block" data-act="start-full">Crear full body</button>
    </div>
    <h2>Días del profe</h2>
    <div class="daybtns">${days}</div>
    <h2>A mi manera</h2>
    <button class="btn block" data-act="start-empty">Empezar vacío y elegir ejercicios</button>
    ${last ? `<p class="muted small" style="margin-top:22px">Último entreno: ${esc(last.title)}, ${fmtDay(last.startedAt)}.</p>` : ''}`;
}

// ---------- Entrenar: active session ----------
function viewSession() {
  const s = state.active;
  const cards = s.items.map((item, i) => exerciseCard(item, i, s.items)).join('');
  return `
    <div class="session-head">
      <span class="muted small">Empezaste a las ${fmtTime(s.startedAt)} · <span id="elapsed" class="num">${minutesBetween(s.startedAt, new Date())} min</span></span>
      <span class="muted small">Descanso ${ROUTINE.general.rest} · RIR ${ROUTINE.general.rir}</span>
    </div>
    ${cards || '<p class="empty">Todavía no hay ejercicios. Añade el primero.</p>'}
    <div class="stack" style="margin-top:16px">
      <button class="btn block" data-act="pick">+ Añadir ejercicio</button>
      <button class="btn primary block" data-act="finish">Terminar y guardar</button>
      <button class="btn ghost danger block" data-act="discard">Descartar entreno</button>
    </div>`;
}

function exerciseCard(item, i, items) {
  const ex = EX[item.exId];
  const last = entriesFor(ex.id)[0];
  const lastSets = last ? last.sets : [];
  const targets = targetsFor(ex, item.sets.length);
  const complete = item.sets.length && item.sets.every((x) => x.done);
  const partners = items.filter((it) => it !== item && EX[it.exId].pair === ex.pair).map((it) => EX[it.exId].name);

  const cols = {
    weight: [['kg', 'kg', 'decimal'], ['reps', 'reps', 'numeric']],
    distance: [['m', 'metros', 'numeric'], ['time', 'tiempo', 'numeric']],
    time: [['sec', 'segundos', 'numeric']],
  }[ex.log];

  const rows = item.sets.map((set, s) => {
    // Grey suggestion: same set last time, else the set above today, else the coach's target.
    const prev = lastSets[s] || lastSets[lastSets.length - 1] || {};
    const above = item.sets[s - 1] || {};
    const placeholder = (key) => prev[key] || above[key] || (key === 'reps' || key === 'm' || key === 'sec' ? targets[s] : '') || '';
    const inputs = cols.map(([key, label, mode]) => `
      <td><input type="text" inputmode="${mode}" autocomplete="off" aria-label="${label} serie ${s + 1}"
        data-i="${i}" data-s="${s}" data-field="${key}" value="${esc(set[key])}" placeholder="${esc(placeholder(key))}"></td>`).join('');
    return `<tr class="${set.done ? 'done' : ''}"><td>${s + 1}</td>${inputs}
      <td><button class="check" data-act="toggle-set" data-i="${i}" data-s="${s}" aria-label="Serie ${s + 1} hecha">${ICONS.check}</button></td></tr>`;
  }).join('');

  return `
  <article class="card excard ${complete ? 'complete' : ''}">
    <div class="exhead">
      <div class="exnum">${complete ? '✓' : i + 1}</div>
      <div class="grow">
        <button class="exname" data-act="detail" data-id="${ex.id}">${esc(ex.name)}</button>
        <div class="rx">${esc(prescription(ex))} · ${esc(SLOT_LABELS[ex.slot])}</div>
        <div class="meta">
          ${ex.format ? `<button class="tag fmt" data-act="format" data-id="${ex.format}">${FORMAT_LABELS[ex.format]}</button>` : ''}
          ${partners.length ? `<span class="tag pair">Superserie con ${esc(partners.join(', '))}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="last">${last ? `Última vez (${fmtShort(last.date)}): <b>${esc(setsText(ex, last.sets))}</b>` : (ex.log === 'weight' ? 'Primera vez: elige un peso cómodo.' : 'Primera vez.')}</div>
    <table class="sets">
      <thead><tr><th></th>${cols.map(([, label]) => `<th>${label}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="tools">
      <button class="icon-btn" data-act="add-set" data-i="${i}" aria-label="Añadir serie">${ICONS.plus}serie</button>
      <button class="icon-btn" data-act="remove-set" data-i="${i}" aria-label="Quitar serie" ${item.sets.length <= 1 ? 'disabled' : ''}>${ICONS.minus}</button>
      <span class="spacer"></span>
      <button class="icon-btn" data-act="move" data-i="${i}" data-dir="-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button>
      <button class="icon-btn" data-act="move" data-i="${i}" data-dir="1" aria-label="Bajar" ${i === items.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>
      <button class="icon-btn" data-act="swap" data-i="${i}" aria-label="Cambiar por otro de ${esc(SLOT_LABELS[ex.slot])}">${ICONS.swap}</button>
      <button class="icon-btn" data-act="remove-item" data-i="${i}" aria-label="Quitar ejercicio">${ICONS.trash}</button>
    </div>
  </article>`;
}

// ---------- Ejercicios ----------
function sortedGroups(sort, filter) {
  let list = ROUTINE.exercises.filter((ex) => !filter || ex.groups.includes(filter));
  if (sort === 'az') {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return [{ title: '', items: list }];
  }
  if (sort === 'slot') {
    return SLOT_ORDER.map((slot) => ({ title: SLOT_LABELS[slot], items: list.filter((ex) => ex.slot === slot) }));
  }
  return Object.entries(ROUTINE.days).map(([day, note]) => ({
    title: `Día ${day}`, note, items: list.filter((ex) => String(ex.day) === day),
  }));
}

function filterChips(current, act) {
  const chip = (value, label) => `<button class="chip" data-act="${act}" data-value="${value ?? ''}" aria-pressed="${current === value}">${label}</button>`;
  return `<div class="chips">${chip(null, 'Todos')}${GROUPS.map((g) => chip(g, g)).join('')}</div>`;
}

function thumb(ex) {
  const m = ex.media[0];
  if (!m) return '<div class="thumb"></div>';
  return `<div class="thumb">${m.src ? `<img src="${m.src}" alt="" loading="lazy">` : m.svg.replace('<svg', '<svg preserveAspectRatio="xMidYMid slice"')}</div>`;
}

function exerciseList(groups, mode) {
  const inSession = new Set((state.active?.items || []).map((it) => it.exId));
  return groups.filter((g) => g.items.length).map((g) => `
    ${g.title ? `<div class="group-title">${esc(g.title)} ${g.note ? `<small>· ${esc(g.note)}</small>` : ''}</div>` : ''}
    <ul class="exlist">${g.items.map((ex) => {
      const added = mode === 'pick' && inSession.has(ex.id);
      return `<li class="exrow">
        <button class="open" data-act="detail" data-id="${ex.id}">
          ${thumb(ex)}
          <span class="grow"><span class="title">${esc(ex.name)}</span><br>
          <span class="sub">${esc(prescription(ex))} · ${esc(ex.groups.join(', '))}</span></span>
        </button>
        <button class="add-btn ${added ? 'added' : ''}" data-act="add" data-id="${ex.id}" aria-label="Añadir ${esc(ex.name)} al entreno">${added ? '✓' : '+'}</button>
      </li>`;
    }).join('')}</ul>`).join('') || '<p class="empty">Ningún ejercicio con ese filtro.</p>';
}

function viewLibrary() {
  const { sort, filter } = state.prefs;
  const seg = (value, label) => `<button data-act="sort" data-value="${value}" aria-pressed="${sort === value}">${label}</button>`;
  const legend = ROUTINE.general.legend.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  return `
    <details class="legend"><summary>¿Qué significa RIR, 12-10-8…?</summary><dl>${legend}</dl></details>
    <div class="seg" style="margin:8px 0 10px">${seg('day', 'Por día')}${seg('slot', 'Por grupo')}${seg('az', 'A–Z')}</div>
    ${filterChips(filter, 'filter')}
    ${exerciseList(sortedGroups(sort, filter), 'library')}`;
}

// ---------- Historial ----------
function sessionStats(s) {
  let sets = 0, volume = 0;
  for (const it of s.items) {
    for (const x of it.sets) {
      if (!x.done) continue;
      sets++;
      const kg = parseFloat(String(x.kg).replace(',', '.'));
      const reps = parseInt(x.reps, 10);
      if (kg && reps) volume += kg * reps;
    }
  }
  return { sets, volume: Math.round(volume) };
}

function viewHistory() {
  const backupDays = state.lastBackup ? (Date.now() - new Date(state.lastBackup)) / 86400000 : Infinity;
  const remind = state.sessions.length >= 3 && backupDays > 30;
  const list = state.sessions.map((s) => {
    const { sets, volume } = sessionStats(s);
    const open = ui.openSession === s.id;
    const details = open ? `<div class="body">
        <table class="hist-table">${s.items.map((it) => {
          const ex = EX[it.exId];
          if (!ex) return '';
          return `<tr><td>${esc(ex.name)}</td><td class="num">${esc(setsText(ex, it.sets.filter((x) => x.done)))}</td></tr>`;
        }).join('')}</table>
        <div class="row" style="margin-top:12px">
          <button class="btn small" data-act="repeat" data-id="${s.id}">Repetir este entreno</button>
          <span class="grow"></span>
          <button class="btn small ghost danger" data-act="delete-session" data-id="${s.id}">Borrar</button>
        </div></div>` : '';
    return `<div class="card sess ${open ? 'open' : ''}">
      <button data-act="toggle-session" data-id="${s.id}">
        <span><span class="when">${fmtDay(s.startedAt)}</span> · ${esc(s.title)}<br>
        <span class="stats num">${s.items.length} ejercicios · ${sets} series${volume ? ` · ${volume.toLocaleString('es')} kg` : ''}${s.finishedAt ? ` · ${minutesBetween(s.startedAt, s.finishedAt)} min` : ''}</span></span>
        <span class="chev">›</span>
      </button>${details}</div>`;
  }).join('');

  return `
    ${remind ? '<div class="note" style="margin-top:14px">Hace más de un mes que no guardas una copia. Exporta una para no perder tu historial.</div>' : ''}
    ${list || '<p class="empty">Aquí aparecerán tus entrenos cuando termines el primero.</p>'}
    <h2>Copia de seguridad</h2>
    <p class="muted small">Tus datos se guardan solo en este dispositivo. Exporta una copia de vez en cuando
      (por ejemplo a iCloud Drive) y úsala para pasarlos al ordenador o a otro teléfono.</p>
    <div class="row wrap-row">
      <button class="btn" data-act="export">Exportar copia</button>
      <label class="btn">Importar copia<input type="file" accept=".json,application/json" data-act="import" hidden></label>
    </div>
    ${state.lastBackup ? `<p class="muted small">Última copia: ${fmtDay(state.lastBackup)}.</p>` : ''}`;
}

// ---------- Sheets (full-screen panels on top) ----------
function renderSheet() {
  const el = $('#sheet');
  if (!ui.sheet) {
    el.hidden = true;
    el.innerHTML = '';
    document.body.classList.remove('locked');
    return;
  }
  const { type, id } = ui.sheet;
  const content = type === 'detail' ? sheetDetail(EX[id]) : type === 'format' ? sheetFormat(id) : sheetPicker();
  const keepScroll = el.hidden ? 0 : el.scrollTop;
  el.innerHTML = `
    <div class="sheet-head"><div class="wrap">
      <h2>${esc(content.title)}</h2>
      ${type === 'picker' ? '<button class="btn primary small" data-act="close">Listo</button>' : `<button class="icon-btn" data-act="close" aria-label="Cerrar">${ICONS.close}</button>`}
    </div></div>
    <div class="sheet-body wrap">${content.body}</div>`;
  el.hidden = false;
  el.scrollTop = keepScroll;
  document.body.classList.add('locked');
}

function mediaBlock(media) {
  return `<div class="media ${media.length === 1 ? 'single' : ''}">${media.map((m) => `
    <figure>${m.src ? `<img src="${m.src}" alt="${esc(m.caption)}">` : m.svg}
    <figcaption>${esc(m.caption)}</figcaption></figure>`).join('')}</div>`;
}

function guideSections(item, isFormat = false) {
  return `
    ${item.equipment.length ? `<h3>${isFormat ? 'Qué necesitas' : 'Máquina o equipo'}</h3><ul>${item.equipment.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${item.muscles ? `<h3>${isFormat ? 'Para qué sirve' : 'Músculos'}</h3><p style="margin:0">${esc(item.muscles)}</p>` : ''}
    <h3>Cómo se hace</h3><ol>${item.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    ${item.tips.length ? `<h3>Claves</h3><ul>${item.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${item.videos.length ? `<h3>Videos</h3>${item.videos.map((v) => `<a class="vid" href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>`).join('')}
      ${item.moreVideos ? `<p class="small"><a href="${esc(item.moreVideos)}" target="_blank" rel="noopener">Buscar más en YouTube</a></p>` : ''}` : ''}`;
}

function progressChart(ex, entries) {
  const points = entries.slice(0, 12).reverse().map((e) => ({ date: e.date, v: bestValue(ex, e.sets) })).filter((p) => p.v);
  if (points.length < 2) return '';
  const W = 320, H = 90, pad = 14;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (v) => (max === min ? H / 2 : H - pad - ((v - min) * (H - pad * 2.4)) / (max - min));
  const unit = { weight: 'kg', distance: 'm', time: 's' }[ex.log];
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  return `<div class="prog"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Progreso de ${esc(ex.name)}">
      <path class="line" d="${path}"/>
      ${points.map((p, i) => `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5"/>`).join('')}
      <text class="axis" x="${pad}" y="11">${fmtShort(points[0].date)}</text>
      <text class="axis" x="${W - pad}" y="11" text-anchor="end">${fmtShort(points[points.length - 1].date)} · ${points[points.length - 1].v} ${unit}</text>
    </svg><p class="muted small" style="margin:2px 0 0">Mejor serie de cada día (máx. ${max} ${unit}).</p></div>`;
}

function sheetDetail(ex) {
  const entries = entriesFor(ex.id);
  const partners = ROUTINE.exercises.filter((o) => o.pair === ex.pair && o.id !== ex.id).map((o) => o.name);
  const history = entries.length ? `
    <h3>Tu historial</h3>
    ${progressChart(ex, entries)}
    <table class="hist-table">${entries.slice(0, 8).map((e) => `<tr><td>${fmtShort(e.date)}</td><td class="num">${esc(setsText(ex, e.sets))}</td></tr>`).join('')}</table>` : '';
  const inSession = state.active?.items.some((it) => it.exId === ex.id);
  return {
    title: ex.name,
    body: `<div class="detail">
      <div class="meta" style="margin-top:12px">
        <span class="tag">Día ${ex.day}</span>
        <span class="tag">${esc(prescription(ex))}</span>
        <span class="tag">${esc(SLOT_LABELS[ex.slot])}</span>
        ${ex.format ? `<button class="tag fmt" data-act="format" data-id="${ex.format}">${FORMAT_LABELS[ex.format]} ›</button>` : ''}
        ${partners.length ? `<span class="tag pair">Superserie con ${esc(partners.join(', '))}</span>` : ''}
      </div>
      ${ex.note ? `<div class="note" style="margin-top:10px">${esc(ex.note)}</div>` : ''}
      ${mediaBlock(ex.media)}
      ${inSession ? '<p class="muted small">Ya está en el entreno de hoy.</p>' : `<button class="btn primary block" data-act="add" data-id="${ex.id}">${state.active ? 'Añadir al entreno de hoy' : 'Empezar entreno con este ejercicio'}</button>`}
      ${history}
      ${guideSections(ex)}
    </div>`,
  };
}

function sheetFormat(id) {
  const f = ROUTINE.formats.find((x) => x.id === id);
  const members = ROUTINE.exercises.filter((ex) => ex.format === id).map((ex) => ex.name);
  return {
    title: f.name,
    body: `<div class="detail">
      ${mediaBlock(f.media)}
      <p>En la rutina del profe: <b>${esc(members.join(', '))}</b>.</p>
      ${guideSections(f, true)}</div>`,
  };
}

function sheetPicker() {
  return {
    title: 'Añadir ejercicios',
    body: `${filterChips(ui.pickFilter, 'pick-filter')}${exerciseList(sortedGroups('slot', ui.pickFilter), 'pick')}`,
  };
}

// ===========================================================================
// Backup: export and import
// ===========================================================================
async function exportBackup() {
  const payload = { app: 'gym-app', version: 1, exportedAt: new Date().toISOString(), sessions: state.sessions };
  const name = `rutina-copia-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(payload, null, 2)], name, { type: 'application/json' });
  try {
    // On iPhone this opens the share sheet ("Guardar en Archivos", AirDrop, Mail...).
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Copia de la rutina' });
    } else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    state.lastBackup = new Date().toISOString();
    save();
    render();
  } catch (err) {
    if (err.name !== 'AbortError') toast('No se pudo exportar');
  }
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sessions)) throw new Error('bad file');
    const known = new Set(state.sessions.map((s) => s.id));
    const fresh = data.sessions.filter((s) => s.id && s.startedAt && Array.isArray(s.items) && !known.has(s.id));
    state.sessions = [...state.sessions, ...fresh].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    save();
    render();
    toast(fresh.length ? `Importados: ${fresh.length}` : 'No había entrenos nuevos en la copia');
  } catch {
    toast('Ese archivo no es una copia válida');
  }
}

// ===========================================================================
// Taps and typing
// ===========================================================================
const actions = {
  tab(el) {
    state.prefs.tab = el.dataset.tab;
    ui.sheet = null;
    save();
    render();
    window.scrollTo(0, 0);
  },
  'start-full'() { startSession('Full body', buildFullBody()); },
  'start-day'(el) {
    const day = el.dataset.day;
    startSession(`Día ${day}`, ROUTINE.exercises.filter((ex) => String(ex.day) === day).map((ex) => ex.id));
  },
  'start-empty'() {
    startSession('Personalizado', []);
    ui.sheet = { type: 'picker' };
    renderSheet();
  },
  'toggle-set'(el) {
    unlockAudio();
    const item = state.active.items[el.dataset.i];
    const set = item.sets[el.dataset.s];
    set.done = !set.done;
    if (set.done) {
      // Empty boxes take the grey suggestion (last time's value or the target).
      el.closest('tr').querySelectorAll('input').forEach((input) => {
        if (!input.value && input.placeholder) set[input.dataset.field] = input.placeholder;
      });
      startRest();
    }
    save();
    render();
  },
  'add-set'(el) {
    const item = state.active.items[el.dataset.i];
    const lastSet = item.sets[item.sets.length - 1] || {};
    item.sets.push({ done: false, kg: lastSet.kg });
    save();
    render();
  },
  'remove-set'(el) {
    const item = state.active.items[el.dataset.i];
    if (item.sets.length > 1) item.sets.pop();
    save();
    render();
  },
  move(el) {
    const items = state.active.items;
    const i = Number(el.dataset.i), j = i + Number(el.dataset.dir);
    [items[i], items[j]] = [items[j], items[i]];
    save();
    render();
  },
  swap(el) { swapItem(Number(el.dataset.i)); },
  'remove-item'(el) {
    const item = state.active.items[el.dataset.i];
    if (item.sets.some((x) => x.done) && !confirm(`¿Quitar ${EX[item.exId].name} y sus series?`)) return;
    state.active.items.splice(el.dataset.i, 1);
    save();
    render();
  },
  pick() { ui.pickFilter = null; ui.sheet = { type: 'picker' }; renderSheet(); },
  'pick-filter'(el) { ui.pickFilter = el.dataset.value || null; renderSheet(); },
  add(el) {
    const id = el.dataset.id;
    if (state.active?.items.some((it) => it.exId === id)) {
      if (ui.sheet?.type === 'picker') {
        state.active.items = state.active.items.filter((it) => it.exId !== id || it.sets.some((x) => x.done));
        save();
        render();
      }
      return;
    }
    addToSession(id);
    if (ui.sheet?.type === 'detail') { ui.sheet = null; state.prefs.tab = 'today'; save(); render(); }
  },
  finish() { finishSession(); },
  discard() { discardSession(false); },
  detail(el) { ui.sheet = { type: 'detail', id: el.dataset.id }; renderSheet(); $('#sheet').scrollTop = 0; },
  format(el) { ui.sheet = { type: 'format', id: el.dataset.id }; renderSheet(); $('#sheet').scrollTop = 0; },
  close() { ui.sheet = null; render(); },
  sort(el) { state.prefs.sort = el.dataset.value; save(); render(); },
  filter(el) { state.prefs.filter = el.dataset.value || null; save(); render(); },
  'toggle-session'(el) { ui.openSession = ui.openSession === el.dataset.id ? null : el.dataset.id; render(); },
  repeat(el) {
    const s = state.sessions.find((x) => x.id === el.dataset.id);
    if (state.active && !confirm('Ya tienes un entreno empezado. ¿Reemplazarlo?')) return;
    startSession(s.title, s.items.map((it) => it.exId).filter((id) => EX[id]));
  },
  'delete-session'(el) {
    if (!confirm('¿Borrar este entreno del historial?')) return;
    state.sessions = state.sessions.filter((x) => x.id !== el.dataset.id);
    save();
    render();
  },
  export() { exportBackup(); },
  'rest-add'() { rest.endsAt += 15000; tick(); },
  'rest-stop'() { stopRest(); },
};

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const action = actions[el.dataset.act];
  if (action) action(el, event);
});

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!input.dataset.field || !state.active) return;
  if (input.dataset.field === 'time') {
    // Type digits only: "152" becomes "1:52".
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    input.value = digits.length > 2 ? `${digits.slice(0, -2)}:${digits.slice(-2)}` : digits;
  }
  state.active.items[input.dataset.i].sets[input.dataset.s][input.dataset.field] = input.value;
  save();
});

document.addEventListener('change', (event) => {
  if (event.target.dataset.act === 'import' && event.target.files[0]) {
    importBackup(event.target.files[0]);
    event.target.value = '';
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && ui.sheet) actions.close();
});

// ===========================================================================
// Start-up
// ===========================================================================
async function init() {
  try {
    ROUTINE = await (await fetch('data/exercises.json')).json();
  } catch {
    $('#main').innerHTML = '<p class="empty">No se pudo cargar la rutina. Abre la app con conexión una vez.</p>';
    return;
  }
  EX = Object.fromEntries(ROUTINE.exercises.map((ex) => [ex.id, ex]));
  render();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js');
  }
  // Ask the browser not to clear our data when the phone runs low on space.
  if (navigator.storage?.persist) navigator.storage.persist();
}

init();
