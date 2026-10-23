/* Kegel Coach · app.js — vanilla JS, nessun build. Funziona in modalità ospite (localStorage) o con Supabase. */
(() => {
'use strict';

/* ───────── utilità ───────── */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDate = d => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const clamp = (v, a, b) => Math.min(b, Math.max(a, Math.round(Number(v) || a)));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2));

const cfg = window.KEGEL_CONFIG || {};
const sb = (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

/* ───────── stato ───────── */
const S = {
  user: null, sessions: [], customs: [], trophies: {},
  exTab: 'programs', pf: { ex: 'all', range: 30 },
  settings: { sound: true, vibrate: true },
};
const LS = 'kegel-coach:v1', LSS = 'kegel-coach:settings';
const cloud = () => !!(sb && S.user);

function lsRead() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } }
function lsSave() {
  if (cloud()) return; // in cloud non tocchiamo i dati ospite
  try { localStorage.setItem(LS, JSON.stringify({ sessions: S.sessions, customs: S.customs, trophies: S.trophies })); } catch { /* storage non disponibile */ }
}
try { Object.assign(S.settings, JSON.parse(localStorage.getItem(LSS)) || {}); } catch { /* ignore */ }
const saveSettings = () => { try { localStorage.setItem(LSS, JSON.stringify(S.settings)); } catch { /* ignore */ } };

/* ───────── contenuti di default ───────── */
const DEFAULTS = [
  { id: 'd-lente', name: 'Contrazioni lente', contract: 5, rest: 5, reps: 10, sets: 1, setRest: 30,
    description: 'Il classico: contrai piano, mantieni, rilascia del tutto. Impara a sentire il muscolo giusto.' },
  { id: 'd-rapide', name: 'Contrazioni rapide', contract: 1, rest: 1, reps: 15, sets: 2, setRest: 20,
    description: 'Contrazioni e rilasci veloci per reattività e controllo dei movimenti improvvisi (tosse, starnuto).' },
  { id: 'd-tenuta', name: 'Tenuta lunga', contract: 10, rest: 10, reps: 8, sets: 1, setRest: 30,
    description: 'Contrazione prolungata per costruire resistenza. Respira normalmente, non trattenere il fiato.' },
  { id: 'd-respiro', name: 'Respiro e rilascio', contract: 4, rest: 6, reps: 10, sets: 1, setRest: 30,
    description: 'Contrai espirando, rilascia inspirando. Ottimo per coordinare respiro e muscoli e per imparare a rilassarti.' },
  { id: 'd-mix', name: 'Mix potenza', contract: 8, rest: 4, reps: 12, sets: 2, setRest: 40,
    description: 'Tenute decise con poco recupero e due serie: per chi ha già buon controllo.' },
];
const PROGRAMS = [
  { id: 'p-base', name: 'Base', tag: 'Principiante', ex: ['d-lente', 'd-rapide'], desc: 'Per cominciare: controllo e consapevolezza.' },
  { id: 'p-medio', name: 'Intermedio', tag: 'Più resistenza', ex: ['d-lente', 'd-tenuta', 'd-rapide'], desc: 'Aggiunge la tenuta lunga per la resistenza.' },
  { id: 'p-pro', name: 'Avanzato', tag: 'Resistenza e potenza', ex: ['d-tenuta', 'd-mix', 'd-rapide', 'd-respiro'], desc: 'Allenamento completo, termina con rilascio guidato.' },
];
const allEx = () => [...DEFAULTS, ...S.customs];
const getEx = id => allEx().find(e => e.id === id);

function buildSteps(ex) {
  const st = [{ t: 'prep', d: 3 }];
  for (let s = 1; s <= ex.sets; s++) {
    for (let r = 1; r <= ex.reps; r++) {
      st.push({ t: 'contract', d: ex.contract, s, r });
      if (r < ex.reps) st.push({ t: 'rest', d: ex.rest, s, r });
    }
    if (s < ex.sets) st.push({ t: 'setrest', d: Math.max(ex.setRest, ex.rest), s, r: ex.reps });
  }
  return st;
}
const secsOf = ex => buildSteps(ex).reduce((a, s) => a + s.d, 0);
const minsLabel = secs => secs < 90 ? `${Math.round(secs)} sec` : `~${Math.round(secs / 60)} min`;
const exMeta = e => `${e.contract}s contrazione · ${e.rest}s riposo · ${e.reps} rip × ${e.sets} serie · ${minsLabel(secsOf(e))}`;

/* ───────── data layer (cloud o locale) ───────── */
const exFromRow = r => ({ id: r.id, name: r.name, description: r.description || '', contract: r.contract_sec, rest: r.rest_sec, reps: r.reps, sets: r.sets, setRest: r.set_rest_sec, custom: true });
const exToRow = e => ({ name: e.name, description: e.description, contract_sec: e.contract, rest_sec: e.rest, reps: e.reps, sets: e.sets, set_rest_sec: e.setRest });

async function loadData() {
  if (cloud()) {
    const [a, b, c] = await Promise.all([
      sb.from('sessions').select('*').order('created_at'),
      sb.from('custom_exercises').select('*').order('created_at'),
      sb.from('user_trophies').select('*'),
    ]);
    const err = a.error || b.error || c.error;
    if (err) toast('Errore nel caricamento: ' + err.message, 'err');
    S.sessions = a.data || [];
    S.customs = (b.data || []).map(exFromRow);
    S.trophies = Object.fromEntries((c.data || []).map(r => [r.trophy_id, r.unlocked_at]));
  } else {
    const d = lsRead();
    S.sessions = d.sessions || [];
    S.customs = (d.customs || []).map(e => ({ ...e, custom: true }));
    S.trophies = d.trophies || {};
  }
}
async function addSession(s) {
  if (cloud()) {
    const { data, error } = await sb.from('sessions').insert(s).select().single();
    if (error) throw error;
    S.sessions.push(data);
  } else {
    S.sessions.push({ ...s, id: uid(), created_at: new Date().toISOString() });
    lsSave();
  }
}
async function saveCustom(e) { // e.id presente = update
  if (cloud()) {
    if (e.id) {
      const { error } = await sb.from('custom_exercises').update(exToRow(e)).eq('id', e.id);
      if (error) throw error;
      Object.assign(S.customs.find(x => x.id === e.id), e);
    } else {
      const { data, error } = await sb.from('custom_exercises').insert(exToRow(e)).select().single();
      if (error) throw error;
      S.customs.push(exFromRow(data));
    }
  } else {
    if (e.id) Object.assign(S.customs.find(x => x.id === e.id), e);
    else S.customs.push({ ...e, id: uid(), custom: true });
    lsSave();
  }
}
async function deleteCustom(id) {
  if (cloud()) { const { error } = await sb.from('custom_exercises').delete().eq('id', id); if (error) throw error; }
  S.customs = S.customs.filter(e => e.id !== id);
  lsSave();
}
async function persistTrophy(id) {
  S.trophies[id] = new Date().toISOString();
  if (cloud()) { await sb.from('user_trophies').insert({ trophy_id: id }); } else lsSave();
}

/* ───────── statistiche & streak ───────── */
function stats() {
  const ss = S.sessions;
  const days = new Set(ss.map(s => s.day));
  const today = dayStr();
  let streak = 0, d = days.has(today) ? new Date() : addDays(new Date(), -1);
  while (days.has(dayStr(d))) { streak++; d = addDays(d, -1); }
  let best = 0, run = 0, prev = null;
  for (const k of [...days].sort()) {
    run = (prev && dayStr(addDays(parseDay(prev), 1)) === k) ? run + 1 : 1;
    best = Math.max(best, run); prev = k;
  }
  return {
    total: ss.length, days: days.size, streak, best,
    avg: ss.length ? Math.round(ss.reduce((a, s) => a + s.score, 0) / ss.length) : 0,
    max: ss.reduce((a, s) => Math.max(a, s.score), 0),
    n90: ss.filter(s => s.score >= 90).length,
    doneToday: days.has(today), customs: S.customs.length,
    mins: Math.round(ss.reduce((a, s) => a + (s.duration_sec || 0), 0) / 60),
  };
}

/* ───────── trofei ───────── */
const hourOf = s => new Date(s.created_at).getHours();
const T = [
  { id: 'first', tier: 'bronze', name: 'Primo passo', desc: 'Completa il tuo primo allenamento', test: c => c.st.total >= 1 },
  { id: 's10', tier: 'bronze', name: 'Rodaggio', desc: 'Completa 10 allenamenti', test: c => c.st.total >= 10, prog: c => [c.st.total, 10] },
  { id: 's50', tier: 'silver', name: 'Abitudine', desc: 'Completa 50 allenamenti', test: c => c.st.total >= 50, prog: c => [c.st.total, 50] },
  { id: 's100', tier: 'gold', name: 'Centurione', desc: 'Completa 100 allenamenti', test: c => c.st.total >= 100, prog: c => [c.st.total, 100] },
  { id: 'st3', tier: 'bronze', name: 'Tre di fila', desc: 'Streak di 3 giorni', test: c => c.st.best >= 3, prog: c => [c.st.best, 3] },
  { id: 'st7', tier: 'silver', name: 'Settimana perfetta', desc: 'Streak di 7 giorni', test: c => c.st.best >= 7, prog: c => [c.st.best, 7] },
  { id: 'st14', tier: 'silver', name: 'Due settimane di fuoco', desc: 'Streak di 14 giorni', test: c => c.st.best >= 14, prog: c => [c.st.best, 14] },
  { id: 'st30', tier: 'gold', name: 'Un mese di costanza', desc: 'Streak di 30 giorni', test: c => c.st.best >= 30, prog: c => [c.st.best, 30] },
  { id: 'st100', tier: 'gold', name: 'Leggenda', desc: 'Streak di 100 giorni', test: c => c.st.best >= 100, prog: c => [c.st.best, 100] },
  { id: 'perfect', tier: 'silver', name: 'Perfezionista', desc: 'Ottieni un punteggio di 100 in un esercizio', test: c => c.st.max >= 100 },
  { id: 'n90', tier: 'silver', name: 'Qualità costante', desc: 'Ottieni 90+ in 5 esercizi', test: c => c.st.n90 >= 5, prog: c => [c.st.n90, 5] },
  { id: 'master', tier: 'gold', name: 'Maestro della tenuta', desc: 'Ottieni 90+ in "Tenuta lunga"', test: () => S.sessions.some(s => s.exercise_id === 'd-tenuta' && s.score >= 90) },
  { id: 'maker', tier: 'bronze', name: 'Creatore', desc: 'Crea un tuo esercizio', test: c => c.st.customs >= 1 },
  { id: 'early', tier: 'bronze', name: 'Mattiniero', desc: 'Allenati prima delle 8:00', test: () => S.sessions.some(s => hourOf(s) < 8) },
  { id: 'late', tier: 'bronze', name: 'Nottambulo', desc: 'Allenati dopo le 22:00', test: () => S.sessions.some(s => hourOf(s) >= 22) },
  { id: 'prog', tier: 'silver', name: 'Programma completato', desc: 'Completa un programma intero dall\'inizio alla fine', test: c => c.event === 'program' },
  { id: 'platinum', tier: 'platinum', name: 'Platino', desc: 'Sblocca tutti gli altri trofei', test: () => false },
];
const TIER_LABEL = { bronze: 'Bronzo', silver: 'Argento', gold: 'Oro', platinum: 'Platino' };
const cup = (tier, locked) => `<svg class="cup ${locked ? 'locked' : tier}" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M7 3h10v6a5 5 0 0 1-10 0V3z" fill="currentColor"/>
  <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M12 14v4M8.5 21h7M12 18h0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

let toastDelay = 0;
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.innerHTML = `<div>${esc(msg)}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4700);
}
function trophyToast(t) {
  const delay = toastDelay; toastDelay += 900;
  setTimeout(() => {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${cup(t.tier)}<div><small>Trofeo sbloccato · ${TIER_LABEL[t.tier]}</small><b>${esc(t.name)}</b></div>`;
    $('#toasts').appendChild(el);
    beep(880, .12); setTimeout(() => beep(1320, .18), 130);
    setTimeout(() => el.remove(), 4700);
    toastDelay = Math.max(0, toastDelay - 900);
  }, delay);
}
async function checkTrophies(event) {
  const ctx = { st: stats(), event };
  const fresh = T.filter(t => t.id !== 'platinum' && !S.trophies[t.id] && t.test(ctx));
  for (const t of fresh) { try { await persistTrophy(t.id); } catch { /* best effort */ } trophyToast(t); }
  const others = T.filter(t => t.id !== 'platinum');
  if (!S.trophies.platinum && others.every(t => S.trophies[t.id])) {
    const p = T.find(t => t.id === 'platinum');
    try { await persistTrophy('platinum'); } catch { /* best effort */ }
    trophyToast(p);
  }
}
function nextTrophy() {
  const c = { st: stats() };
  let best = null;
  for (const t of T) {
    if (S.trophies[t.id] || !t.prog) continue;
    const [cur, tot] = t.prog(c); const r = cur / tot;
    if (!best || r > best.r) best = { t, cur, tot, r };
  }
  return best;
}

/* ───────── audio / vibrazione ───────── */
let AC = null;
function beep(freq = 660, dur = .1) {
  if (!S.settings.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(.0001, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.25, AC.currentTime + .01);
    g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + dur + .02);
  } catch { /* audio non disponibile */ }
}
const vibrate = p => { if (S.settings.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch { /* ignore */ } };

/* ───────── router & render ───────── */
const VIEWS = { home: vHome, exercises: vExercises, progress: vProgress, trophies: vTrophies, profile: vProfile };
const routeName = () => { const r = (location.hash.replace(/^#\//, '') || 'home').split('?')[0]; return VIEWS[r] ? r : 'home'; };

function render() {
  const r = routeName();
  $('#view').innerHTML = VIEWS[r]();
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === r));
  const st = stats();
  $('#streakChip').textContent = `🔥 ${st.streak}`;
  $('#userDot').textContent = cloud() ? (S.user.email || 'Account').split('@')[0] : 'Ospite';
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

/* ───────── viste ───────── */
function recommended() {
  const n = stats().total;
  return PROGRAMS[n < 10 ? 0 : n < 30 ? 1 : 2];
}
function vHome() {
  const st = stats(), rec = recommended(), nt = nextTrophy();
  const set = new Set(S.sessions.map(s => s.day));
  const dots = [...Array(7)].map((_, i) => {
    const d = addDays(new Date(), i - 6), k = dayStr(d);
    return `<div class="dot ${set.has(k) ? 'on' : ''} ${k === dayStr() ? 'today' : ''}">${'DLMMGVS'[d.getDay()]}</div>`;
  }).join('');
  const risk = st.streak > 0 && !st.doneToday;
  const msg = st.doneToday ? 'Obiettivo di oggi completato 🎉'
    : risk ? `Allenati oggi per non perdere la streak di ${st.streak} ${st.streak === 1 ? 'giorno' : 'giorni'}!`
    : 'Un allenamento oggi e parte la tua streak.';
  const last = S.sessions.slice(-1)[0];
  return `
  ${sb && !S.user ? `<div class="banner">Stai usando la modalità ospite (dati solo su questo dispositivo). <a href="#/profile">Accedi</a> per salvare tutto nel cloud.</div>` : ''}
  <div class="card hero">
    <div class="row between">
      <div><div class="mut sm">Streak giornaliera</div>
        <div class="streak-big">🔥 ${st.streak}</div></div>
      <div class="center"><div class="mut sm">Record</div><b style="font-size:1.5rem">${st.best}</b></div>
    </div>
    <div class="week">${dots}</div>
    <p class="sm ${risk ? '' : 'mut'}" style="margin-top:10px;${risk ? 'color:var(--warn)' : ''}">${msg}</p>
  </div>

  <div class="card">
    <div class="row between wrap"><div><h2>Allenamento consigliato</h2>
      <p class="mut sm">${esc(rec.name)} · ${rec.ex.map(id => esc(getEx(id).name)).join(' → ')}</p></div>
      <span class="tag">${esc(rec.tag)}</span></div>
    <button class="btn pri big" data-act="startProgram" data-id="${rec.id}" style="margin-top:12px">▶ Inizia ora</button>
  </div>

  ${nt ? `<div class="card"><div class="row">${cup(nt.t.tier)}<div class="grow"><b>${esc(nt.t.name)}</b>
    <div class="sm mut">${esc(nt.t.desc)} · ${nt.cur}/${nt.tot}</div>
    <div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, nt.r * 100)}%"></i></div></div></div></div>` : ''}

  <div class="grid3">
    <div class="stat"><b>${st.total}</b><span>allenamenti</span></div>
    <div class="stat"><b>${st.avg}</b><span>score medio</span></div>
    <div class="stat"><b>${last ? last.score : '–'}</b><span>ultimo score</span></div>
  </div>
  <p class="sm mut center" style="margin-top:18px">Non è un consiglio medico. Se senti dolore interrompi l'esercizio e parlane con un professionista.</p>`;
}

function exCard(e) {
  const mine = !!e.custom;
  return `<div class="card">
    <div class="row between wrap"><h3>${esc(e.name)}</h3>${mine ? '<span class="tag">Mio</span>' : ''}</div>
    ${e.description ? `<p class="sm">${esc(e.description)}</p>` : ''}
    <p class="ex-meta">${exMeta(e)}</p>
    <div class="row wrap" style="margin-top:10px">
      <button class="btn pri sm" data-act="startEx" data-id="${esc(e.id)}">▶ Avvia</button>
      ${mine ? `<button class="btn sm" data-act="editCustom" data-id="${esc(e.id)}">Modifica</button>
                <button class="btn sm danger" data-act="delCustom" data-id="${esc(e.id)}">Elimina</button>` : ''}
    </div></div>`;
}
function vExercises() {
  const tab = S.exTab;
  const seg = `<div class="seg">${[['programs', 'Programmi'], ['all', 'Esercizi'], ['mine', `I miei (${S.customs.length})`]]
    .map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="exTab" data-id="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'programs') {
    body = PROGRAMS.map(p => {
      const exs = p.ex.map(getEx), secs = exs.reduce((a, e) => a + secsOf(e), 0);
      return `<div class="card"><div class="row between wrap"><h3>${esc(p.name)}</h3><span class="tag">${esc(p.tag)}</span></div>
        <p class="sm">${esc(p.desc)}</p>
        <p class="ex-meta">${exs.map(e => esc(e.name)).join(' → ')} · ${minsLabel(secs)}</p>
        <button class="btn pri sm" style="margin-top:10px" data-act="startProgram" data-id="${p.id}">▶ Avvia programma</button></div>`;
    }).join('');
  } else if (tab === 'all') {
    body = allEx().map(exCard).join('');
  } else {
    body = `<button class="btn pri big" data-act="newCustom" style="margin-bottom:14px">＋ Crea esercizio</button>` +
      (S.customs.length ? S.customs.map(exCard).join('') : `<div class="empty">Non hai ancora esercizi personalizzati.<br>Scegli tu durata di contrazione, riposo, ripetizioni e serie.</div>`);
  }
  return `<h1>Esercizi</h1>${seg}${body}`;
}

function chartSvg(points) {
  if (points.length < 2) return `<div class="empty">Servono almeno 2 giorni di allenamento per il grafico.</div>`;
  const W = 600, H = 240, p = { l: 38, r: 14, t: 12, b: 30 };
  const t0 = points[0].x.getTime(), t1 = points[points.length - 1].x.getTime();
  const X = d => p.l + (t1 === t0 ? 0 : (d.getTime() - t0) / (t1 - t0)) * (W - p.l - p.r);
  const Y = v => p.t + (1 - v / 100) * (H - p.t - p.b);
  const line = points.map((q, i) => `${i ? 'L' : 'M'}${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join('');
  const area = `${line}L${X(points[points.length - 1].x).toFixed(1)},${Y(0)}L${X(points[0].x).toFixed(1)},${Y(0)}Z`;
  const grid = [0, 25, 50, 75, 100].map(v => `<line class="grid" x1="${p.l}" x2="${W - p.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${p.l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const dots = points.map(q => `<circle class="pt" cx="${X(q.x).toFixed(1)}" cy="${Y(q.y).toFixed(1)}" r="4"><title>${fmtDate(q.x)}: ${q.y}</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento del punteggio nel tempo">${grid}
    <path class="area" d="${area}"/><path class="line" d="${line}"/>${dots}
    <text x="${p.l}" y="${H - 6}">${fmtDate(points[0].x)}</text><text x="${W - p.r}" y="${H - 6}" text-anchor="end">${fmtDate(points[points.length - 1].x)}</text></svg>`;
}
function heatmap() {
  const counts = {};
  S.sessions.forEach(s => counts[s.day] = (counts[s.day] || 0) + 1);
  const today = new Date(), dow = (today.getDay() + 6) % 7;
  const start = addDays(today, -(15 * 7 + dow));
  let cells = '';
  for (let i = 0; i < 16 * 7; i++) {
    const d = addDays(start, i), k = dayStr(d), n = counts[k] || 0;
    cells += `<i class="${d > today ? 'fut' : n >= 3 ? 'l3' : n === 2 ? 'l2' : n === 1 ? 'l1' : ''}" title="${fmtDate(d)}: ${n}"></i>`;
  }
  return `<div class="heat">${cells}</div>`;
}
function vProgress() {
  const st = stats(), { ex, range } = S.pf;
  const cutoff = range ? addDays(new Date(), -range) : new Date(0);
  const list = S.sessions.filter(s => (ex === 'all' || s.exercise_id === ex) && parseDay(s.day) >= cutoff);
  const byDay = {};
  list.forEach(s => (byDay[s.day] = byDay[s.day] || []).push(s.score));
  const pts = Object.keys(byDay).sort().map(k => ({ x: parseDay(k), y: Math.round(byDay[k].reduce((a, b) => a + b, 0) / byDay[k].length) }));
  const used = [...new Map(S.sessions.map(s => [s.exercise_id, s.exercise_name])).entries()];
  const recent = [...S.sessions].reverse().slice(0, 8);
  if (!S.sessions.length) return `<h1>Progressi</h1><div class="empty card">Nessun dato ancora.<br>Completa il primo allenamento per vedere qui il tuo andamento.<br><br><a class="btn pri" href="#/home" style="text-decoration:none;display:inline-block">Vai agli allenamenti</a></div>`;
  return `<h1>Progressi</h1>
  <div class="grid3" style="margin-bottom:14px">
    <div class="stat"><b>${st.avg}</b><span>score medio</span></div>
    <div class="stat"><b>${st.max}</b><span>record score</span></div>
    <div class="stat"><b>${st.mins}</b><span>minuti totali</span></div>
    <div class="stat"><b>${st.total}</b><span>allenamenti</span></div>
    <div class="stat"><b>${st.streak}</b><span>streak attuale</span></div>
    <div class="stat"><b>${st.best}</b><span>streak record</span></div>
  </div>
  <div class="card">
    <div class="row wrap" style="margin-bottom:8px">
      <select data-change="pfEx" style="flex:2;min-width:140px"><option value="all">Tutti gli esercizi</option>
        ${used.map(([id, n]) => `<option value="${esc(id)}" ${id === ex ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <select data-change="pfRange" style="flex:1;min-width:110px">
        ${[[30, 'Ultimi 30 gg'], [90, 'Ultimi 90 gg'], [0, 'Sempre']].map(([v, l]) => `<option value="${v}" ${v === range ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <h3>Score nel tempo</h3>${chartSvg(pts)}
  </div>
  <div class="card"><h3>Costanza (ultime 16 settimane)</h3>${heatmap()}</div>
  <div class="card"><h3>Ultimi allenamenti</h3>${recent.map(s => `<div class="list-i"><div><b>${esc(s.exercise_name)}</b>
    <div class="sm mut">${fmtDate(parseDay(s.day))} · ${s.completed_reps}/${s.total_reps} rip · controllo ${s.quality}/5</div></div><div class="score">${s.score}</div></div>`).join('')}</div>`;
}

function vTrophies() {
  const got = T.filter(t => S.trophies[t.id]).length, pct = Math.round(got / T.length * 100);
  const cnt = tier => T.filter(t => t.tier === tier && S.trophies[t.id]).length;
  const c = { st: stats() };
  const order = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
  const rows = [...T].sort((a, b) => (!!S.trophies[b.id] - !!S.trophies[a.id]) || order[a.tier] - order[b.tier]).map(t => {
    const own = S.trophies[t.id];
    const pr = !own && t.prog ? t.prog(c) : null;
    return `<div class="tr ${own ? '' : 'lock'}">${cup(t.tier, !own)}<div class="grow"><div class="nm">${esc(t.name)} <span class="tag">${TIER_LABEL[t.tier]}</span></div>
      <div class="ds">${esc(t.desc)}</div>
      ${pr ? `<div class="bar"><i style="width:${Math.min(100, pr[0] / pr[1] * 100)}%"></i></div>` : ''}
      ${own ? `<div class="ds">Sbloccato il ${new Date(own).toLocaleDateString('it-IT')}</div>` : ''}</div></div>`;
  }).join('');
  return `<h1>Trofei</h1>
  <div class="card hero"><div class="row between"><div><div class="streak-big">${pct}%</div><div class="mut sm">${got} di ${T.length} sbloccati</div></div>
    ${cup(S.trophies.platinum ? 'platinum' : 'gold', !got)}</div>
    <div class="bar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
    <div class="tier-sum">${['platinum', 'gold', 'silver', 'bronze'].map(t => `<span>${cup(t)}${cnt(t)}</span>`).join('')}</div></div>
  <div class="card">${rows}</div>`;
}

function vProfile() {
  const settings = `<div class="card"><h3>Impostazioni</h3>
    <label class="row between" style="margin:8px 0"><span style="color:var(--tx);font-size:1rem">Suoni guida</span><input type="checkbox" data-change="sound" ${S.settings.sound ? 'checked' : ''} style="width:auto"></label>
    <label class="row between" style="margin:8px 0"><span style="color:var(--tx);font-size:1rem">Vibrazione</span><input type="checkbox" data-change="vibrate" ${S.settings.vibrate ? 'checked' : ''} style="width:auto"></label></div>`;
  let acct;
  if (!sb) {
    acct = `<div class="card"><h3>Modalità locale</h3><p class="sm mut">Supabase non è configurato: i dati restano su questo dispositivo. Inserisci URL e anon key in <code>config.js</code> per attivare account e salvataggio cloud.</p></div>`;
  } else if (S.user) {
    acct = `<div class="card"><h3>Account</h3><p class="sm">Connesso come <b>${esc(S.user.email)}</b></p>
      <p class="sm mut">I tuoi dati sono salvati nel cloud e sincronizzati tra i dispositivi.</p>
      <button class="btn danger" data-act="signout">Esci</button></div>`;
  } else {
    acct = `<div class="card"><h3>Accedi o crea un account</h3>
      <p class="sm mut">Con l'account salvi esercizi, punteggi e trofei nel cloud.</p>
      <label for="em">Email</label><input id="em" type="email" autocomplete="email" inputmode="email">
      <label for="pw">Password (min. 6 caratteri)</label><input id="pw" type="password" autocomplete="current-password">
      <div class="row" style="margin-top:14px"><button class="btn pri grow" data-act="signin">Accedi</button><button class="btn grow" data-act="signup">Registrati</button></div></div>`;
  }
  const data = `<div class="card"><h3>I tuoi dati</h3><div class="row wrap">
    <button class="btn sm" data-act="export">Esporta JSON</button>
    ${!cloud() ? '<button class="btn sm danger" data-act="resetLocal">Cancella dati locali</button>' : ''}</div></div>`;
  return `<h1>Profilo</h1>${acct}${settings}${data}
    <p class="sm mut center">Kegel Coach · gli esercizi non sostituiscono il parere medico.</p>`;
}

/* ───────── modal esercizio personalizzato ───────── */
function openCustom(id) {
  const e = id ? S.customs.find(x => x.id === id) : { name: '', description: '', contract: 5, rest: 5, reps: 10, sets: 1, setRest: 30 };
  const num = (k, l, min, max) => `<div><label for="f-${k}">${l}</label><input id="f-${k}" type="number" min="${min}" max="${max}" value="${e[k]}" inputmode="numeric"></div>`;
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Esercizio">
    <h2>${id ? 'Modifica esercizio' : 'Nuovo esercizio'}</h2>
    <label for="f-name">Nome</label><input id="f-name" maxlength="60" value="${esc(e.name)}" placeholder="Es. Tenuta serale">
    <label for="f-desc">Note (facoltative)</label><textarea id="f-desc" rows="2" maxlength="300">${esc(e.description)}</textarea>
    <div class="grid2">${num('contract', 'Contrazione (sec)', 1, 30)}${num('rest', 'Riposo (sec)', 1, 30)}
      ${num('reps', 'Ripetizioni', 1, 50)}${num('sets', 'Serie', 1, 10)}</div>
    ${num('setRest', 'Pausa tra le serie (sec)', 0, 120)}
    <div class="row" style="margin-top:18px"><button class="btn grow" data-act="closeModal">Annulla</button>
      <button class="btn pri grow" data-act="saveCustom" data-id="${id ? esc(id) : ''}">Salva</button></div></div></div>`;
  if (matchMedia('(hover:hover)').matches) $('#f-name')?.focus(); // su touch niente focus automatico (coprirebbe il form con la tastiera)
}
const closeModal = () => { $('#modal').innerHTML = ''; };

/* ───────── runner (allenamento guidato) ───────── */
let R = null, wake = null;
const RING = 578.05;
async function takeWake() { try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; } }
function dropWake() { try { wake?.release(); } catch { /* ignore */ } wake = null; }

function startRun(list, programId) {
  if (!list.length) return;
  R = { queue: list, qi: 0, results: [], program: programId || null, timer: null };
  beep(1, .01); // sblocca l'audio su iOS con un gesto utente
  takeWake();
  loadExercise();
}
function loadExercise() {
  const ex = R.queue[R.qi];
  Object.assign(R, { ex, steps: buildSteps(ex), i: 0, paused: false, done: 0, missed: false, elapsed: 0, totalReps: ex.reps * ex.sets });
  R.left = R.steps[0].d;
  $('#runner').innerHTML = `<div class="run" role="dialog" aria-label="Allenamento">
    <div class="run-top"><button class="btn sm" data-act="runQuit" aria-label="Esci">✕</button>
      <div class="t">Esercizio ${R.qi + 1}/${R.queue.length}<br><b style="color:var(--tx)">${esc(ex.name)}</b></div>
      <button class="btn sm" id="r-pause" data-act="runPause">⏸</button></div>
    <div class="orb-wrap"><svg viewBox="0 0 200 200"><circle class="ring-bg" cx="100" cy="100" r="92"/><circle class="ring" id="r-ring" cx="100" cy="100" r="92"/></svg>
      <div class="orb prep" id="r-orb"></div>
      <div class="orb-txt"><div class="cue" id="r-cue"></div><div class="cnt" id="r-cnt"></div></div></div>
    <div class="run-info" id="r-info"></div>
    <div class="run-hint" id="r-hint"></div>
    <div class="run-act"><button class="btn" id="r-miss" data-act="runMiss">Non ci riesco</button></div></div>`;
  enterStep(true);
  clearInterval(R.timer);
  R.timer = setInterval(tick, 100);
}
const HINT = {
  prep: 'Mettiti comodo e respira. Rilassa addome, glutei e cosce.',
  contract: 'Stringi e solleva i muscoli pelvici. Respira normalmente.',
  rest: 'Rilascia completamente.',
  setrest: 'Pausa tra le serie: respira e rilassati.',
};
function enterStep(first) {
  const st = R.steps[R.i], orb = $('#r-orb');
  if (!orb) return;
  orb.style.transitionDuration = Math.min(st.d * .6, 1.2) + 's';
  orb.className = 'orb ' + (st.t === 'contract' ? 'on' : st.t === 'prep' ? 'prep' : '');
  $('#r-cue').textContent = { prep: 'Preparati', contract: 'Contrai', rest: 'Rilascia', setrest: 'Pausa' }[st.t];
  $('#r-hint').textContent = HINT[st.t];
  $('#r-info').textContent = st.t === 'prep' ? `${R.ex.reps} rip × ${R.ex.sets} serie`
    : `Serie ${st.s}/${R.ex.sets} · Ripetizione ${st.r}/${R.ex.reps}`;
  const miss = $('#r-miss');
  miss.style.visibility = st.t === 'contract' ? 'visible' : 'hidden';
  miss.textContent = 'Non ci riesco';
  miss.disabled = false;
  $('#r-ring').style.stroke = st.t === 'contract' ? 'var(--acc)' : 'var(--mut)';
  if (!first) { beep(st.t === 'contract' ? 740 : 520, .1); vibrate(st.t === 'contract' ? 60 : 25); }
  updateRing();
}
function updateRing() {
  const st = R.steps[R.i];
  $('#r-ring').style.strokeDashoffset = (RING * (1 - (1 - R.left / st.d))).toFixed(1);
  $('#r-cnt').textContent = Math.max(1, Math.ceil(R.left - 0.001));
}
function tick() {
  if (!R || R.paused) return;
  R.left -= 0.1; R.elapsed += 0.1;
  if (R.left <= 0.001) return nextStep();
  updateRing();
}
function nextStep() {
  const cur = R.steps[R.i];
  if (cur.t === 'contract' && !R.missed) R.done++;
  R.missed = false;
  R.i++;
  if (R.i >= R.steps.length) return finishExercise();
  R.left = R.steps[R.i].d;
  enterStep(false);
}
function finishExercise() {
  clearInterval(R.timer); R.timer = null; dropWake();
  beep(988, .15); vibrate([80, 40, 80]);
  $('#runner').innerHTML = `<div class="run"><div style="margin:auto;width:100%;max-width:420px" class="center">
    <h1>${esc(R.ex.name)}</h1>
    <p class="mut">Ripetizioni completate: <b style="color:var(--tx)">${R.done}/${R.totalReps}</b></p>
    <h2 style="margin-top:18px">Quanto controllo hai sentito?</h2>
    <div class="stars" role="radiogroup" aria-label="Valutazione controllo">${[1, 2, 3, 4, 5].map(n => `<button data-act="rate" data-id="${n}" aria-label="${n} su 5">★</button>`).join('')}</div>
    <p class="sm mut" id="r-qlbl">1 = faticoso e instabile · 5 = controllo ottimo</p>
    <button class="btn pri big" id="r-save" data-act="saveRun" disabled style="margin-top:14px">Salva risultato</button></div></div>`;
  R.quality = 0;
}
const QL = ['', 'Faticoso e instabile', 'Un po\' difficile', 'Discreto', 'Buon controllo', 'Controllo ottimo'];
async function saveRun() {
  const total = R.totalReps, score = Math.round((R.done / total) * 70 + (R.quality / 5) * 30);
  const rec = { exercise_id: R.ex.id, exercise_name: R.ex.name, score, completed_reps: R.done, total_reps: total,
    quality: R.quality, duration_sec: Math.round(R.elapsed), day: dayStr() };
  $('#r-save').disabled = true;
  try { await addSession(rec); } catch (e) { toast('Salvataggio non riuscito: ' + e.message, 'err'); $('#r-save').disabled = false; return; }
  R.results.push(rec);
  const last = R.qi === R.queue.length - 1;
  await checkTrophies(last && R.program ? 'program' : null);
  const st = stats();
  $('#runner').innerHTML = `<div class="run"><div style="margin:auto;width:100%;max-width:420px" class="center">
    <p class="mut">${esc(R.ex.name)}</p><div class="bigscore">${score}</div><p class="mut">punti su 100</p>
    <div class="card" style="margin-top:16px;text-align:left">
      <div class="list-i"><span>Ripetizioni (${R.done}/${total})</span><b>${Math.round(R.done / total * 70)}/70</b></div>
      <div class="list-i"><span>Controllo (${R.quality}/5)</span><b>${Math.round(R.quality / 5 * 30)}/30</b></div>
      <div class="list-i"><span>Streak</span><b>🔥 ${st.streak}</b></div></div>
    ${last ? `<button class="btn pri big" data-act="runDone">Fine</button>`
      : `<button class="btn pri big" data-act="runNext">Prossimo: ${esc(R.queue[R.qi + 1].name)} →</button>`}</div></div>`;
}
function endRun() { if (R?.timer) clearInterval(R.timer); R = null; dropWake(); $('#runner').innerHTML = ''; render(); }

/* ───────── auth ───────── */
async function authDo(kind) {
  const email = $('#em')?.value.trim(), password = $('#pw')?.value;
  if (!email || !password) return toast('Inserisci email e password', 'err');
  if (password.length < 6) return toast('La password deve avere almeno 6 caratteri', 'err');
  if (kind === 'up') {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return toast(error.message, 'err');
    if (!data.session) toast('Registrazione quasi fatta: controlla la tua email per confermare.');
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return toast(error.message, 'err');
  }
}
async function maybeImportLocal() {
  const d = lsRead();
  if (!(d.sessions?.length || d.customs?.length)) return;
  if (!confirm('Ci sono dati salvati su questo dispositivo (modalità ospite). Vuoi importarli nel tuo account?')) return;
  try {
    const idMap = {};
    for (const e of d.customs || []) {
      const { data, error } = await sb.from('custom_exercises').insert(exToRow(e)).select().single();
      if (error) throw error; idMap[e.id] = data.id;
    }
    const rows = (d.sessions || []).map(s => ({ exercise_id: idMap[s.exercise_id] || s.exercise_id, exercise_name: s.exercise_name,
      score: s.score, completed_reps: s.completed_reps, total_reps: s.total_reps, quality: s.quality, duration_sec: s.duration_sec, day: s.day, created_at: s.created_at }));
    if (rows.length) { const { error } = await sb.from('sessions').insert(rows); if (error) throw error; }
    const tr = Object.entries(d.trophies || {}).map(([trophy_id, unlocked_at]) => ({ trophy_id, unlocked_at }));
    if (tr.length) await sb.from('user_trophies').insert(tr);
    localStorage.removeItem(LS);
    await loadData();
    toast('Dati importati nel tuo account');
  } catch (e) { toast('Import non riuscito: ' + e.message, 'err'); }
}

/* ───────── azioni (event delegation) ───────── */
const ACTS = {
  startProgram: el => { const p = PROGRAMS.find(x => x.id === el.dataset.id); startRun(p.ex.map(getEx), p.id); },
  startEx: el => { const e = getEx(el.dataset.id); if (e) startRun([e], null); },
  exTab: el => { S.exTab = el.dataset.id; render(); },
  newCustom: () => openCustom(),
  editCustom: el => openCustom(el.dataset.id),
  closeModal,
  delCustom: async el => {
    if (!confirm('Eliminare questo esercizio? Lo storico dei punteggi resta.')) return;
    try { await deleteCustom(el.dataset.id); render(); } catch (e) { toast(e.message, 'err'); }
  },
  saveCustom: async el => {
    const name = $('#f-name').value.trim();
    if (!name) return toast('Dai un nome all\'esercizio', 'err');
    const e = { id: el.dataset.id || undefined, name, description: $('#f-desc').value.trim(),
      contract: clamp($('#f-contract').value, 1, 30), rest: clamp($('#f-rest').value, 1, 30),
      reps: clamp($('#f-reps').value, 1, 50), sets: clamp($('#f-sets').value, 1, 10), setRest: clamp($('#f-setRest').value || 0, 0, 120) };
    try { await saveCustom(e); closeModal(); S.exTab = 'mine'; render(); await checkTrophies(); }
    catch (err) { toast('Salvataggio non riuscito: ' + err.message, 'err'); }
  },
  runPause: el => { if (!R) return; R.paused = !R.paused; el.textContent = R.paused ? '▶' : '⏸'; $('#r-hint').textContent = R.paused ? 'In pausa' : HINT[R.steps[R.i].t]; },
  runMiss: el => { if (!R) return; R.missed = true; el.textContent = 'Rep segnata come mancata'; el.disabled = true; },
  runQuit: () => { if (confirm('Interrompere l\'allenamento? I risultati di questo esercizio non verranno salvati.')) endRun(); },
  rate: el => {
    const n = Number(el.dataset.id); R.quality = n;
    document.querySelectorAll('.stars button').forEach((b, i) => b.classList.toggle('on', i < n));
    $('#r-qlbl').textContent = QL[n]; $('#r-save').disabled = false;
  },
  saveRun,
  runNext: () => { R.qi++; loadExercise(); },
  runDone: endRun,
  signin: () => authDo('in'),
  signup: () => authDo('up'),
  signout: async () => { await sb.auth.signOut(); },
  export: () => {
    const blob = new Blob([JSON.stringify({ sessions: S.sessions, customs: S.customs, trophies: S.trophies }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kegel-coach-dati.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  resetLocal: async () => {
    if (!confirm('Cancellare tutti i dati salvati su questo dispositivo? Non si può annullare.')) return;
    try { localStorage.removeItem(LS); } catch { /* ignore */ }
    await loadData(); render();
  },
};
document.addEventListener('click', e => {
  if (e.target.classList?.contains('modal-bg')) return closeModal();
  const el = e.target.closest('[data-act]');
  if (el && ACTS[el.dataset.act]) ACTS[el.dataset.act](el, e);
});
document.addEventListener('change', e => {
  const k = e.target.dataset?.change; if (!k) return;
  if (k === 'pfEx') { S.pf.ex = e.target.value; render(); }
  else if (k === 'pfRange') { S.pf.range = Number(e.target.value); render(); }
  else if (k === 'sound' || k === 'vibrate') { S.settings[k] = e.target.checked; saveSettings(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').innerHTML) closeModal(); });

/* ───────── avvio ───────── */
let booted = false;
async function boot() {
  await loadData();
  await checkTrophies();
  render();
}
if (sb) {
  sb.auth.onAuthStateChange((_ev, session) => {
    const u = session?.user || null;
    if (booted && (u?.id || null) === (S.user?.id || null)) return;
    booted = true; S.user = u;
    setTimeout(async () => { // fuori dal callback, come raccomanda Supabase
      await loadData();
      if (u) await maybeImportLocal();
      await checkTrophies();
      if (u && routeName() === 'profile') location.hash = '#/home';
      render();
    }, 0);
  });
} else {
  boot();
}
})();
