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
  endImgs: [], endImgsAt: 0, exTab: 'programs', authMode: 'in', ready: false, recovery: false, pf: { ex: 'all', range: 30 },
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

const isCircuit = e => !!e?.circuit?.items;
const circuitComps = e => e.circuit.items.map(getEx).filter(c => c && !isCircuit(c));
const circuitNames = e => isCircuit(e) ? circuitComps(e).map(c => c.name).join(' → ') : '';

function buildSteps(ex) {
  if (isCircuit(ex)) { // circuito: esercizi in sequenza, ripetuti per il numero di giri
    const comps = circuitComps(ex), { rounds, rest } = ex.circuit;
    const st = [{ t: 'prep', d: 3, name: ex.name }];
    for (let g = 1; g <= rounds; g++) {
      comps.forEach((c, i) => {
        st.push(...buildSteps(c).slice(1).map(x => ({ ...x, name: c.name, round: g, rounds })));
        const last = g === rounds && i === comps.length - 1;
        if (!last && rest > 0) st.push({ t: 'setrest', d: rest, between: true, name: c.name, next: comps[(i + 1) % comps.length].name, round: g, rounds });
      });
    }
    return comps.length ? st : [st[0]];
  }
  const st = [{ t: 'prep', d: 3, name: ex.name }];
  for (let s = 1; s <= ex.sets; s++) {
    for (let r = 1; r <= ex.reps; r++) {
      st.push({ t: 'contract', d: ex.contract, s, r, name: ex.name, nsets: ex.sets, nreps: ex.reps });
      if (r < ex.reps) st.push({ t: 'rest', d: ex.rest, s, r, name: ex.name, nsets: ex.sets, nreps: ex.reps });
    }
    if (s < ex.sets) st.push({ t: 'setrest', d: Math.max(ex.setRest, ex.rest), s, r: ex.reps, name: ex.name, nsets: ex.sets, nreps: ex.reps });
  }
  return st;
}
const secsOf = ex => buildSteps(ex).reduce((a, s) => a + s.d, 0);
const minsLabel = secs => secs < 90 ? `${Math.round(secs)} sec` : `~${Math.round(secs / 60)} min`;
const exMeta = e => isCircuit(e)
  ? `Circuito · ${e.circuit.items.length} esercizi × ${e.circuit.rounds} ${e.circuit.rounds === 1 ? 'giro' : 'giri'} · ${minsLabel(secsOf(e))}`
  : `${e.contract}s contrazione · ${e.rest}s riposo · ${e.reps} rip × ${e.sets} serie · ${minsLabel(secsOf(e))}`;

/* ───────── data layer (cloud o locale) ───────── */
const exFromRow = r => ({ id: r.id, name: r.name, description: r.description || '', contract: r.contract_sec, rest: r.rest_sec, reps: r.reps, sets: r.sets, setRest: r.set_rest_sec, custom: true, ...(r.circuit ? { circuit: r.circuit } : {}) });
const exToRow = e => ({ name: e.name, description: e.description, contract_sec: e.contract, rest_sec: e.rest, reps: e.reps, sets: e.sets, set_rest_sec: e.setRest, ...(e.circuit ? { circuit: e.circuit } : {}) });

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
  { id: 'circuit', tier: 'bronze', name: 'Costruttore di circuiti', desc: 'Crea un circuito con più esercizi', test: () => S.customs.some(isCircuit) },
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

const authRequired = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
function authGate() {
  if (!authRequired) return null;                 // senza Supabase: modalità locale (solo sviluppo/anteprima)
  if (!sb) return gateShell(`<h1>Kegel Coach</h1><p class="mut">Non riesco a collegarmi al servizio di accesso. Controlla la connessione e ricarica la pagina.</p>
    <button class="btn pri big" onclick="location.reload()">Ricarica</button>`);
  if (!S.ready) return gateShell('<p class="mut">Un attimo…</p>');
  if (S.recovery) return gateShell(`<h1>Nuova password</h1><p class="mut">Scegli una nuova password per il tuo account.</p>
    <form data-form="recover"><label for="np">Nuova password (almeno 6 caratteri)</label>
    <input id="np" type="password" autocomplete="new-password" minlength="6" required>
    <button class="btn pri big" type="submit" style="margin-top:20px">Salva password</button></form>`);
  if (S.user && !getName()) return gateShell(`<h1>Come ti chiami?</h1><p class="mut">Lo useremo per salutarti ogni giorno.</p>
    <form data-form="name"><label for="nm">Nome</label><input id="nm" maxlength="30" autocomplete="given-name" required>
    <button class="btn pri big" type="submit" style="margin-top:22px">Continua</button></form>`);
  if (!S.user) {
    const up = S.authMode === 'up';
    return gateShell(`<h1>Kegel Coach</h1>
    <p class="mut">Cinque minuti al giorno per allenare i muscoli pelvici.</p>
    <nav class="subtabs" aria-label="Accesso"><button class="${up ? '' : 'on'}" data-act="authMode" data-id="in">Accedi</button><button class="${up ? 'on' : ''}" data-act="authMode" data-id="up">Registrati</button></nav>
    <form data-form="auth">
      ${up ? '<label for="nm">Come ti chiami?</label><input id="nm" maxlength="30" autocomplete="given-name" required>' : ''}
      <label for="em">Email</label><input id="em" type="email" autocomplete="email" inputmode="email" required>
      <label for="pw">Password${up ? ' (almeno 6 caratteri)' : ''}</label><input id="pw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="6" required>
      <button class="btn pri big" type="submit" style="margin-top:22px">${up ? 'Crea account' : 'Accedi'}</button>
    </form>
    ${up ? '' : '<p class="center" style="margin-top:14px"><button class="link" data-act="forgot">Password dimenticata?</button></p>'}
    <p class="fine">Gli esercizi non sostituiscono il parere medico.</p>`);
  }
  return null;
}
const getName = () => (cloud() ? S.user.user_metadata?.name : S.settings.name) || '';
const cleanName = v => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 30);
async function setName(name) {
  name = cleanName(name);
  if (!name) throw new Error('Scrivi il tuo nome');
  if (cloud()) {
    const { data, error } = await sb.auth.updateUser({ data: { name } });
    if (error) throw error;
    S.user = data?.user || { ...S.user, user_metadata: { ...S.user.user_metadata, name } };
  } else { S.settings.name = name; saveSettings(); }
}
const gateShell = inner => `<section class="gate"><div class="gate-orb" aria-hidden="true"></div>${inner}</section>`;

function render() {
  const gate = authGate();
  document.body.classList.toggle('gated', !!gate);
  if (gate) { $('#view').innerHTML = gate; return; }
  const r = routeName();
  $('#view').innerHTML = VIEWS[r]();
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === r));
  const st = stats();
  $('#streakChip').innerHTML = `${icon('flame', 18, true)}${st.streak}`;
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

/* ───────── viste ───────── */
const IC = {
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
};
const icon = (n, s = 22, fill) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; };

function recommended() {
  const n = stats().total;
  return PROGRAMS[n < 10 ? 0 : n < 30 ? 1 : 2];
}
function vHome() {
  const st = stats(), rec = recommended(), nt = nextTrophy();
  const set = new Set(S.sessions.map(s => s.day));
  const monday = addDays(new Date(), -((new Date().getDay() + 6) % 7)); // la settimana inizia di lunedì
  const pebbles = [...Array(7)].map((_, i) => {
    const d = addDays(monday, i), k = dayStr(d);
    return `<li class="pebble ${set.has(k) ? 'on' : ''} ${k === dayStr() ? 'today' : ''} ${k > dayStr() ? 'fut' : ''}"><i></i><span>${'LMMGVSD'[i]}</span></li>`;
  }).join('');
  const risk = st.streak > 0 && !st.doneToday;
  const exs = rec.ex.map(getEx), mins = minsLabel(exs.reduce((a, e) => a + secsOf(e), 0));
  const note = risk ? `<p class="note warn">La serie di <b>${st.streak} ${st.streak === 1 ? 'giorno' : 'giorni'}</b> si chiude a mezzanotte.</p>`
    : `<p class="note">${st.best > st.streak ? `Il tuo record è ${st.best} giorni.` : st.streak ? 'Questo è il tuo record. Continua così.' : 'Il primo allenamento avvia la serie.'}</p>`;
  return `
  <section class="hero">
    <p class="greet">${greeting()}${getName() ? ', ' + esc(getName()) : ''}</p>
    <h1>${st.doneToday ? 'Per oggi hai finito.' : 'Pronto per oggi?'}</h1>
    <button class="breath" data-act="startProgram" data-id="${rec.id}" aria-label="Inizia il programma ${esc(rec.name)}">
      <span>${st.doneToday ? 'Ancora una' : 'Inizia'}</span><small>${esc(rec.name)} · ${mins}</small></button>
    <p class="hero-sub">${exs.map(e => esc(e.name)).join(', ')}</p>
  </section>

  <section class="streak" aria-label="Streak">
    <div class="streak-num"><b>${st.streak}</b><span>${st.streak === 1 ? 'giorno' : 'giorni'} di fila</span></div>
    <ul class="pebbles">${pebbles}</ul>
    ${note}
  </section>

  ${nt ? `<section class="next">${cup(nt.t.tier)}<div class="grow"><b>${esc(nt.t.name)}</b>
    <div class="sm mut">${esc(nt.t.desc)} (${nt.cur}/${nt.tot})</div>
    <div class="bar"><i style="width:${Math.min(100, nt.r * 100)}%"></i></div></div></section>` : ''}

  <section class="figs">
    <div><b>${st.total}</b><span>allenamenti</span></div>
    <div><b>${st.avg}</b><span>score medio</span><button class="info-btn mini" data-act="scoreInfo" aria-label="Come si calcola lo score">${icon('info', 16)}</button></div>
    <div><b>${S.sessions.length ? S.sessions[S.sessions.length - 1].score : '–'}</b><span>ultimo score</span></div>
  </section>
  <p class="fine">Non è un consiglio medico. Se senti dolore, interrompi e parlane con un professionista.</p>`;
}

function itemRow(title, desc, meta, tag, act, id, extra) {
  return `<article class="item"><div class="item-main">
    <h3>${esc(title)}${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</h3>
    ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}<p class="meta">${meta}</p>${extra || ''}</div>
    <button class="play" data-act="${act}" data-id="${esc(id)}" aria-label="Avvia ${esc(title)}">${icon('play', 22, true)}</button></article>`;
}
const exRow = e => itemRow(e.name, e.description || circuitNames(e), exMeta(e), e.custom ? (isCircuit(e) ? 'Circuito' : 'Mio') : '', 'startEx', e.id,
  e.custom ? `<div class="item-act"><button class="link" data-act="editCustom" data-id="${esc(e.id)}">Modifica</button><button class="link danger" data-act="delCustom" data-id="${esc(e.id)}">Elimina</button></div>` : '');

function vExercises() {
  const tab = S.exTab;
  const subs = `<nav class="subtabs" aria-label="Sezioni">${[['programs', 'Programmi'], ['all', 'Esercizi'], ['mine', 'I miei']]
    .map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="exTab" data-id="${k}">${l}</button>`).join('')}</nav>`;
  let body;
  if (tab === 'programs') {
    body = PROGRAMS.map(p => {
      const exs = p.ex.map(getEx), secs = exs.reduce((a, e) => a + secsOf(e), 0);
      return itemRow(p.name, p.desc, `${exs.map(e => esc(e.name)).join(', ')} · ${minsLabel(secs)}`, p.tag, 'startProgram', p.id);
    }).join('');
  } else if (tab === 'all') {
    body = allEx().map(exRow).join('');
  } else {
    body = `<button class="btn pri add" data-act="newCustom">Crea esercizio o circuito</button>` +
      (S.customs.length ? S.customs.map(exRow).join('') : `<p class="empty">Qui compariranno i tuoi esercizi.<br>Scegli tu contrazione, riposo, ripetizioni e serie.</p>`);
  }
  return `<h1>Esercizi</h1>${subs}${body}`;
}

function chartSvg(points) {
  if (points.length < 2) return `<p class="empty">Servono almeno due giorni di allenamento per vedere il grafico.</p>`;
  const W = 600, H = 240, p = { l: 38, r: 14, t: 12, b: 30 };
  const t0 = points[0].x.getTime(), t1 = points[points.length - 1].x.getTime();
  const X = d => p.l + (t1 === t0 ? 0 : (d.getTime() - t0) / (t1 - t0)) * (W - p.l - p.r);
  const Y = v => p.t + (1 - v / 100) * (H - p.t - p.b);
  const line = points.map((q, i) => `${i ? 'L' : 'M'}${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join('');
  const area = `${line}L${X(points[points.length - 1].x).toFixed(1)},${Y(0)}L${X(points[0].x).toFixed(1)},${Y(0)}Z`;
  const grid = [0, 50, 100].map(v => `<line class="grid" x1="${p.l}" x2="${W - p.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${p.l - 8}" y="${Y(v) + 5}" text-anchor="end">${v}</text>`).join('');
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
  if (!S.sessions.length) return `<h1>Progressi</h1><p class="empty">Nessun dato per ora.<br>Dopo il primo allenamento vedrai qui il tuo andamento.<br><br><a class="btn pri" href="#/home" style="text-decoration:none;display:inline-block">Vai agli allenamenti</a></p>`;
  const cutoff = range ? addDays(new Date(), -range) : new Date(0);
  const list = S.sessions.filter(s => (ex === 'all' || s.exercise_id === ex) && parseDay(s.day) >= cutoff);
  const byDay = {};
  list.forEach(s => (byDay[s.day] = byDay[s.day] || []).push(s.score));
  const pts = Object.keys(byDay).sort().map(k => ({ x: parseDay(k), y: Math.round(byDay[k].reduce((a, b) => a + b, 0) / byDay[k].length) }));
  const used = [...new Map(S.sessions.map(s => [s.exercise_id, s.exercise_name])).entries()];
  const recent = [...S.sessions].reverse().slice(0, 8);
  return `<h1>Progressi</h1>
  <section class="figs"><div><b>${st.avg}</b><span>score medio</span></div><div><b>${st.max}</b><span>record</span></div><div><b>${st.mins}</b><span>minuti</span></div></section>
  <section class="figs" style="border:0;padding-top:0;margin-top:20px"><div><b>${st.total}</b><span>allenamenti</span></div><div><b>${st.streak}</b><span>streak attuale</span></div><div><b>${st.best}</b><span>streak record</span></div></section>
  <section><div class="row between"><h2>Score nel tempo</h2>${infoBtn('Come si calcola')}</div>
    <div class="filters" style="margin-top:12px">
      <select data-change="pfEx" aria-label="Esercizio"><option value="all">Tutti gli esercizi</option>
        ${used.map(([id, n]) => `<option value="${esc(id)}" ${id === ex ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <select data-change="pfRange" aria-label="Periodo">
        ${[[30, 'Ultimi 30 giorni'], [90, 'Ultimi 90 giorni'], [0, 'Sempre']].map(([v, l]) => `<option value="${v}" ${v === range ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>${chartSvg(pts)}</section>
  <section><h2>Costanza</h2><p class="sm mut" style="margin-bottom:10px">Le ultime 16 settimane</p>${heatmap()}</section>
  <section><h2>Ultimi allenamenti</h2>${recent.map(s => `<div class="list-i"><div><b>${esc(s.exercise_name)}</b>
    <div class="sm mut">${fmtDate(parseDay(s.day))} · ${s.completed_reps}/${s.total_reps} ripetizioni · controllo ${s.quality}/5</div></div><div class="score">${s.score}</div></div>`).join('')}</section>`;
}

function vTrophies() {
  const got = T.filter(t => S.trophies[t.id]).length, pct = Math.round(got / T.length * 100);
  const cnt = tier => T.filter(t => t.tier === tier && S.trophies[t.id]).length;
  const c = { st: stats() };
  const order = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
  const rows = [...T].sort((a, b) => (!!S.trophies[b.id] - !!S.trophies[a.id]) || order[a.tier] - order[b.tier]).map(t => {
    const own = S.trophies[t.id];
    const pr = !own && t.prog ? t.prog(c) : null;
    return `<div class="tr ${own ? '' : 'lock'}"><span class="medal ${own ? t.tier : ''}">${cup(t.tier, !own)}</span><div class="grow"><div class="nm">${esc(t.name)} <span class="tag">${TIER_LABEL[t.tier]}</span></div>
      <div class="ds">${esc(t.desc)}</div>
      ${pr ? `<div class="bar"><i style="width:${Math.min(100, pr[0] / pr[1] * 100)}%"></i></div>` : ''}
      ${own ? `<div class="ds">Sbloccato il ${new Date(own).toLocaleDateString('it-IT')}</div>` : ''}</div></div>`;
  }).join('');
  return `<h1>Trofei</h1>
  <section class="streak" style="margin-top:20px"><div class="streak-num"><b class="big-pct" style="font-size:4.5rem;font-weight:300">${pct}%</b><span>${got} di ${T.length} sbloccati</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="tier-sum">${['platinum', 'gold', 'silver', 'bronze'].map(t => `<span>${cup(t)}${cnt(t)}</span>`).join('')}</div></section>
  <section style="margin-top:20px">${rows}</section>`;
}

function vProfile() {
  const settings = `<div class="block"><h2>Impostazioni</h2>
    <label class="toggle"><span>Suoni guida</span><input type="checkbox" data-change="sound" ${S.settings.sound ? 'checked' : ''}></label>
    <label class="toggle"><span>Vibrazione</span><input type="checkbox" data-change="vibrate" ${S.settings.vibrate ? 'checked' : ''}></label></div>`;
  let acct;
  if (!sb) {
    acct = `<div class="block"><h2>Modalità locale</h2><p class="sm mut" style="margin-top:6px">Supabase non è configurato: i dati restano su questo dispositivo. Inserisci URL e chiave in <code>config.js</code> per attivare gli account.</p></div>`;
  } else if (S.user) {
    acct = `<div class="block"><h2>Account</h2>
      <div class="list-i" style="border:0;padding-bottom:0"><span>Nome</span><span><b>${esc(getName())}</b> <button class="link" data-act="editName">Modifica</button></span></div>
      <div class="list-i" style="border:0;padding-top:4px"><span>Email</span><b>${esc(S.user.email)}</b></div>
      <p class="sm mut">I dati sono salvati nel cloud e sincronizzati tra i dispositivi.</p>
      <button class="btn ghost" style="margin-top:14px" data-act="signout">Esci</button></div>`;
  } else {
    acct = `<div class="block"><h2>Accedi o registrati</h2>
      <p class="sm mut" style="margin-top:6px">Con un account salvi esercizi, punteggi e trofei nel cloud.</p>
      <label for="em">Email</label><input id="em" type="email" autocomplete="email" inputmode="email">
      <label for="pw">Password (almeno 6 caratteri)</label><input id="pw" type="password" autocomplete="current-password">
      <div class="row" style="margin-top:18px"><button class="btn pri grow" data-act="signin">Accedi</button><button class="btn ghost grow" data-act="signup">Registrati</button></div></div>`;
  }
  const data = `<div class="block"><h2>I tuoi dati</h2><div class="row wrap" style="margin-top:12px">
    <button class="btn ghost sm" data-act="export">Esporta in JSON</button>
    ${!cloud() ? '<button class="btn ghost danger sm" data-act="resetLocal">Cancella dati locali</button>' : ''}</div></div>`;
  const danger = cloud() ? `<div class="block"><h2>Elimina account</h2>
    <p class="sm mut" style="margin-top:6px">Cancella in modo definitivo il tuo account, gli esercizi, i punteggi e i trofei. Non si può annullare.</p>
    <button class="btn ghost danger" style="margin-top:14px" data-act="deleteAccount">Elimina il mio account</button></div>` : '';
  return `<h1>Profilo</h1>${acct}${settings}${data}${danger}
    <p class="fine">Gli esercizi non sostituiscono il parere medico.</p>`;
}

/* ───────── modal esercizio personalizzato ───────── */
let DR = null; // bozza dell'esercizio nel modal
function newDraft(id) {
  const e = id ? S.customs.find(x => x.id === id) : null;
  const base = { id: '', type: 'single', name: '', description: '', contract: 5, rest: 5, reps: 10, sets: 1, setRest: 30, items: [], rounds: 2, cRest: 10 };
  if (!e) return base;
  return isCircuit(e)
    ? { ...base, id: e.id, type: 'circuit', name: e.name, description: e.description || '', items: [...e.circuit.items], rounds: e.circuit.rounds, cRest: e.circuit.rest }
    : { ...base, id: e.id, name: e.name, description: e.description || '', contract: e.contract, rest: e.rest, reps: e.reps, sets: e.sets, setRest: e.setRest };
}
function syncDraft() { // copia nella bozza ciò che è scritto nei campi
  if (!DR || !$('#f-name')) return;
  DR.name = $('#f-name').value; DR.description = $('#f-desc').value;
  const val = (k, fallback) => { const v = $('#f-' + k).value; return v === '' ? fallback : Number(v); };
  if (DR.type === 'single') for (const k of ['contract', 'rest', 'reps', 'sets', 'setRest']) DR[k] = val(k, DR[k]);
  else { DR.rounds = val('rounds', DR.rounds); DR.cRest = val('cRest', DR.cRest); }
}
function renderCustom() {
  const d = DR, isNew = !d.id;
  const num = (k, l, min, max) => `<div><label for="f-${k}">${l}</label><input id="f-${k}" type="number" min="${min}" max="${max}" value="${d[k]}" inputmode="numeric"></div>`;
  const pool = allEx().filter(e => !isCircuit(e) && e.id !== d.id);
  let body;
  if (d.type === 'single') {
    body = `<div class="grid2">${num('contract', 'Contrazione (sec)', 1, 30)}${num('rest', 'Riposo (sec)', 1, 30)}
      ${num('reps', 'Ripetizioni', 1, 50)}${num('sets', 'Serie', 1, 10)}</div>${num('setRest', 'Pausa tra le serie (sec)', 0, 120)}`;
  } else {
    const secs = d.items.length ? secsOf({ name: d.name, circuit: { items: d.items, rounds: clamp(d.rounds, 1, 10), rest: clamp(d.cRest, 0, 60) } }) : 0;
    body = `<h3 style="margin-top:22px">Esercizi del circuito</h3>
    ${d.items.length ? d.items.map((id, i) => `<div class="cir-item"><span class="cir-n">${i + 1}</span><span class="grow">${esc(getEx(id)?.name || 'Esercizio eliminato')}</span>
      <button type="button" class="link" data-act="draftUp" data-id="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su">Su</button>
      <button type="button" class="link" data-act="draftDown" data-id="${i}" ${i === d.items.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">Giù</button>
      <button type="button" class="link danger" data-act="draftDel" data-id="${i}">Togli</button></div>`).join('')
      : '<p class="sm mut" style="margin-top:8px">Aggiungi almeno due esercizi: puoi ripetere lo stesso più volte.</p>'}
    <div class="row" style="margin-top:14px"><select id="f-pick" style="flex:1" aria-label="Esercizio da aggiungere">${pool.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select>
      <button type="button" class="btn sm" data-act="draftAdd">Aggiungi</button></div>
    <div class="grid2">${num('rounds', 'Giri', 1, 10)}${num('cRest', 'Pausa tra esercizi (sec)', 0, 60)}</div>
    ${secs ? `<p class="sm mut" style="margin-top:12px">Durata stimata: ${minsLabel(secs)}</p>` : ''}`;
  }
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Esercizio personalizzato">
    <h2>${isNew ? 'Nuovo allenamento' : 'Modifica'}</h2>
    ${isNew ? `<nav class="subtabs" aria-label="Tipo"><button class="${d.type === 'single' ? 'on' : ''}" data-act="draftType" data-id="single">Esercizio singolo</button><button class="${d.type === 'circuit' ? 'on' : ''}" data-act="draftType" data-id="circuit">Circuito</button></nav>` : ''}
    <label for="f-name">Nome</label><input id="f-name" maxlength="60" value="${esc(d.name)}" placeholder="${d.type === 'circuit' ? 'Es. Circuito serale' : 'Es. Tenuta serale'}">
    <label for="f-desc">Note (facoltative)</label><textarea id="f-desc" rows="2" maxlength="300">${esc(d.description)}</textarea>
    ${body}
    <div class="row" style="margin-top:22px"><button class="btn ghost grow" data-act="closeModal">Annulla</button>
      <button class="btn pri grow" data-act="saveCustom">Salva</button></div></div></div>`;
}
function openCustom(id) {
  DR = newDraft(id); renderCustom();
  if (matchMedia('(hover:hover)').matches) $('#f-name')?.focus(); // su touch niente focus automatico (coprirebbe il form con la tastiera)
}
const closeModal = () => { $('#modal').innerHTML = ''; DR = null; };

const infoBtn = (label = 'Come si calcola lo score') => `<button class="info-btn" data-act="scoreInfo">${icon('info', 18)}<span>${label}</span></button>`;
function openScoreInfo() {
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Come si calcola lo score">
    <h2>Come si calcola lo score</h2>
    <p class="mut" style="margin-top:6px">Ogni esercizio vale da 0 a 100 punti, in due parti.</p>
    <div class="legend">
      <div class="leg-row"><span class="leg-pts">70</span><div><b>Ripetizioni</b>
        <p class="sm mut">Ogni ripetizione portata a termine vale lo stesso numero di punti. Se tocchi "Non ci riesco", quella ripetizione non conta.</p>
        <p class="sm">Esempio: 8 ripetizioni su 10 = 56 punti.</p></div></div>
      <div class="leg-row"><span class="leg-pts">30</span><div><b>Controllo</b>
        <p class="sm mut">A fine esercizio dai da 1 a 5 stelle a quanto controllo hai sentito. Ogni stella vale 6 punti.</p>
        <p class="sm">Esempio: 4 stelle = 24 punti.</p></div></div>
    </div>
    <p class="sm"><b>Totale dell'esempio:</b> 56 + 24 = 80 punti.</p>
    <div class="legend bands">
      <div><b>90–100</b><span>Ottimo</span></div><div><b>75–89</b><span>Buono</span></div>
      <div><b>50–74</b><span>In crescita</span></div><div><b>0–49</b><span>Da consolidare</span></div></div>
    <p class="sm mut">Le stelle le assegni tu: sii onesto, il grafico serve a vedere i tuoi miglioramenti reali. Nei Progressi, lo score di un giorno è la media degli esercizi di quel giorno.</p>
    <button class="btn pri big" data-act="closeModal" style="margin-top:20px">Ho capito</button></div></div>`;
}

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
  Object.assign(R, { ex, steps: buildSteps(ex), i: 0, paused: false, done: 0, missed: false, elapsed: 0, totalReps: 0 });
  R.totalReps = R.steps.filter(x => x.t === 'contract').length;
  if (!R.totalReps) { toast('Questo circuito non ha esercizi disponibili. Modificalo e aggiungine.', 'err'); return endRun(); }
  R.left = R.steps[0].d;
  $('#runner').innerHTML = `<div class="run" id="r-run" data-phase="prep" role="dialog" aria-label="Allenamento">
    <div class="run-top"><button class="round" data-act="runQuit" aria-label="Esci dall'allenamento">${icon('close')}</button>
      <div class="t">${R.queue.length > 1 ? `Esercizio ${R.qi + 1} di ${R.queue.length}` : isCircuit(ex) ? 'Circuito' : 'Esercizio'}<b id="r-name">${esc(ex.name)}</b></div>
      <button class="round" id="r-pause" data-act="runPause" aria-label="Pausa">${icon('pause')}</button></div>
    <div class="orb-wrap"><svg viewBox="0 0 200 200"><circle class="ring-bg" cx="100" cy="100" r="92"/><circle class="ring" id="r-ring" cx="100" cy="100" r="92"/></svg>
      <div class="orb prep" id="r-orb"></div>
      <div class="orb-txt"><div class="cue" id="r-cue"></div><div class="cnt" id="r-cnt"></div></div></div>
    <div class="run-info" id="r-info"></div>
    <div class="run-hint" id="r-hint"></div>
    <div class="run-act"><button class="btn ghost" id="r-miss" data-act="runMiss">Non ci riesco</button></div></div>`;
  enterStep(true);
  clearInterval(R.timer);
  R.timer = setInterval(tick, 100);
}
const hintFor = st => st.between ? `Prossimo esercizio: ${st.next}` : HINT[st.t];
const HINT = {
  prep: 'Mettiti comodo e respira. Rilassa addome, glutei e cosce.',
  contract: 'Stringi e solleva i muscoli pelvici. Respira normalmente.',
  rest: 'Rilascia completamente.',
  setrest: 'Pausa tra le serie: respira e rilassati.',
};
function enterStep(first) {
  const st = R.steps[R.i], orb = $('#r-orb');
  if (!orb) return;
  $('#r-run').dataset.phase = st.t;
  orb.style.transitionDuration = Math.min(st.d * .7, 1.6) + 's';
  orb.className = 'orb ' + (st.t === 'contract' ? 'on' : st.t === 'prep' ? 'prep' : '');
  $('#r-cue').textContent = { prep: 'Preparati', contract: 'Contrai', rest: 'Rilascia', setrest: 'Pausa' }[st.t];
  $('#r-hint').textContent = hintFor(st);
  $('#r-name').textContent = st.name || R.ex.name;
  const giro = st.round ? `Giro ${st.round} di ${st.rounds}` : '';
  $('#r-info').textContent = st.t === 'prep'
    ? (isCircuit(R.ex) ? `${circuitComps(R.ex).length} esercizi × ${R.ex.circuit.rounds} ${R.ex.circuit.rounds === 1 ? 'giro' : 'giri'} · ${R.totalReps} ripetizioni` : `${R.ex.reps} ripetizioni × ${R.ex.sets} serie`)
    : st.between ? giro
    : [giro, `Serie ${st.s} di ${st.nsets} · Ripetizione ${st.r} di ${st.nreps}`].filter(Boolean).join(' · ');
  const miss = $('#r-miss');
  miss.style.visibility = st.t === 'contract' ? 'visible' : 'hidden';
  miss.textContent = 'Non ci riesco';
  miss.disabled = false;
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
  refreshEndImages();
  clearInterval(R.timer); R.timer = null; dropWake();
  beep(988, .15); vibrate([80, 40, 80]);
  $('#runner').innerHTML = `<div class="run"><div class="sheet" style="margin:auto">
    <h1>${esc(R.ex.name)}</h1>
    <p class="mut" style="margin-top:6px">Ripetizioni completate: <b style="color:var(--ink)">${R.done} su ${R.totalReps}</b></p>
    <h2 style="margin-top:36px">Quanto controllo hai sentito?</h2>
    <div class="stars" role="group" aria-label="Valutazione del controllo">${[1, 2, 3, 4, 5].map(n => `<button data-act="rate" data-id="${n}" aria-label="${n} su 5">${icon('star', 40, true)}</button>`).join('')}</div>
    <p class="sm mut" id="r-qlbl">Da 1 (faticoso e instabile) a 5 (controllo ottimo)</p>
    ${infoBtn()}
    <button class="btn pri big" id="r-save" data-act="saveRun" disabled style="margin-top:28px">Salva risultato</button></div></div>`;
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
  $('#runner').innerHTML = `<div class="run"><div class="sheet" style="margin:auto">
    ${endImage()}
    <p class="mut">${esc(R.ex.name)}</p><div class="bigscore">${score}</div><p class="mut">punti su 100</p>
    ${infoBtn()}
    <div style="margin:28px 0">
      <div class="list-i"><span>Ripetizioni (${R.done} su ${total})</span><b>${Math.round(R.done / total * 70)} / 70</b></div>
      <div class="list-i"><span>Controllo (${R.quality} su 5)</span><b>${Math.round(R.quality / 5 * 30)} / 30</b></div>
      <div class="list-i"><span>Streak</span><b>${st.streak} ${st.streak === 1 ? 'giorno' : 'giorni'}</b></div></div>
    ${last ? `<button class="btn pri big" data-act="runDone">Fine</button>`
      : `<button class="btn pri big" data-act="runNext">Prossimo: ${esc(R.queue[R.qi + 1].name)}</button>`}</div></div>`;
}
/* Immagini private: bucket Supabase "end-images", una cartella per utente (nome = ID utente). Le vede solo il proprietario. */
const IMG_RE = /\.(jpe?g|png|webp|avif)$/i;
async function loadEndImages() {
  if (!cloud()) { S.endImgs = []; return; }
  try {
    const bucket = sb.storage.from('end-images');
    const { data: files, error } = await bucket.list(S.user.id, { limit: 50 });
    if (error || !files) { S.endImgs = []; return; }
    const paths = files.filter(f => IMG_RE.test(f.name)).map(f => `${S.user.id}/${f.name}`);
    if (!paths.length) { S.endImgs = []; S.endImgsAt = Date.now(); return; }
    const { data: signed } = await bucket.createSignedUrls(paths, 21600); // validi 6 ore
    S.endImgs = (signed || []).map(x => x.signedUrl).filter(Boolean);
    S.endImgsAt = Date.now();
    S.endImgs.forEach(u => { const im = new Image(); im.src = u; }); // precarica
  } catch { S.endImgs = []; }
}
const refreshEndImages = () => { if (cloud() && Date.now() - (S.endImgsAt || 0) > 5 * 3600e3) loadEndImages(); };

function endImage() { // immagine a rotazione a fine esercizio
  const list = [...(S.endImgs || []), ...(cfg.END_IMAGES || [])].filter(Boolean);
  if (!list.length) return '';
  let last = -1; try { last = Number(sessionStorage.getItem('kegel:lastImg')); } catch { /* ignore */ }
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last) i = (i + 1) % list.length;
  try { sessionStorage.setItem('kegel:lastImg', String(i)); } catch { /* ignore */ }
  return `<img class="end-img" src="${esc(list[i])}" alt="" onerror="this.remove()">`;
}
function endRun() { if (R?.timer) clearInterval(R.timer); R = null; dropWake(); $('#runner').innerHTML = ''; render(); }

/* ───────── auth ───────── */
const AUTH_ERR = {
  'Invalid login credentials': 'Email o password non corrette.',
  'User already registered': 'Esiste già un account con questa email. Prova ad accedere.',
  'Email not confirmed': 'Conferma prima l\'email: ti abbiamo mandato un link.',
};
const authMsg = e => AUTH_ERR[e.message] || e.message;
async function authDo(kind) {
  const email = $('#em')?.value.trim(), password = $('#pw')?.value;
  if (!email || !password) return toast('Inserisci email e password', 'err');
  if (password.length < 6) return toast('La password deve avere almeno 6 caratteri', 'err');
  if (kind === 'up' && !cleanName($('#nm')?.value)) return toast('Scrivi il tuo nome', 'err');
  const btn = $('form[data-form=auth] button[type=submit]'); if (btn) btn.disabled = true;
  try {
    if (kind === 'up') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname, data: { name: cleanName($('#nm')?.value) } } });
      if (error) return toast(authMsg(error), 'err');
      if (!data.session) { toast('Quasi fatto: controlla la tua email e conferma l\'account, poi accedi.'); S.authMode = 'in'; render(); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return toast(authMsg(error), 'err');
    }
  } catch (e) { toast('Connessione non riuscita. Riprova.', 'err'); }
  finally { if (btn) btn.disabled = false; }
}
async function maybeImportLocal() {
  const d = lsRead();
  if (!(d.sessions?.length || d.customs?.length)) return;
  if (!confirm('Ci sono dati salvati su questo dispositivo (modalità ospite). Vuoi importarli nel tuo account?')) return;
  try {
    const idMap = {};
    for (const e0 of [...(d.customs || [])].sort((a, b) => isCircuit(a) - isCircuit(b))) { // prima i singoli, poi i circuiti
      const e = isCircuit(e0) ? { ...e0, circuit: { ...e0.circuit, items: e0.circuit.items.map(i => idMap[i] || i) } } : e0;
      const { data, error } = await sb.from('custom_exercises').insert(exToRow(e)).select().single();
      if (error) throw error; idMap[e0.id] = data.id;
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
  scoreInfo: openScoreInfo,
  delCustom: async el => {
    if (!confirm('Eliminare questo esercizio? Lo storico dei punteggi resta.')) return;
    try { await deleteCustom(el.dataset.id); render(); } catch (e) { toast(e.message, 'err'); }
  },
  draftType: el => { syncDraft(); DR.type = el.dataset.id; renderCustom(); },
  draftAdd: () => { syncDraft(); const id = $('#f-pick')?.value; if (id) DR.items.push(id); renderCustom(); },
  draftDel: el => { syncDraft(); DR.items.splice(Number(el.dataset.id), 1); renderCustom(); },
  draftUp: el => { syncDraft(); const i = Number(el.dataset.id); if (i > 0) [DR.items[i - 1], DR.items[i]] = [DR.items[i], DR.items[i - 1]]; renderCustom(); },
  draftDown: el => { syncDraft(); const i = Number(el.dataset.id); if (i < DR.items.length - 1) [DR.items[i + 1], DR.items[i]] = [DR.items[i], DR.items[i + 1]]; renderCustom(); },
  saveCustom: async () => {
    syncDraft();
    const d = DR, name = d.name.trim();
    if (!name) return toast('Dai un nome all\'allenamento', 'err');
    let e;
    if (d.type === 'circuit') {
      const items = d.items.filter(id => getEx(id) && !isCircuit(getEx(id)));
      if (items.length < 2) return toast('Un circuito ha bisogno di almeno due esercizi', 'err');
      e = { id: d.id || undefined, name, description: d.description.trim(), contract: 1, rest: 1, reps: 1, sets: 1, setRest: 0,
        circuit: { items, rounds: clamp(d.rounds, 1, 10), rest: clamp(d.cRest, 0, 60) } };
    } else {
      e = { id: d.id || undefined, name, description: d.description.trim(),
        contract: clamp(d.contract, 1, 30), rest: clamp(d.rest, 1, 30), reps: clamp(d.reps, 1, 50), sets: clamp(d.sets, 1, 10), setRest: clamp(d.setRest, 0, 120) };
    }
    try { await saveCustom(e); closeModal(); S.exTab = 'mine'; render(); await checkTrophies(); }
    catch (err) { toast('Salvataggio non riuscito: ' + err.message, 'err'); }
  },
  runPause: el => { if (!R) return; R.paused = !R.paused; el.innerHTML = icon(R.paused ? 'play' : 'pause', 22, R.paused); el.setAttribute('aria-label', R.paused ? 'Riprendi' : 'Pausa'); $('#r-hint').textContent = R.paused ? 'In pausa' : hintFor(R.steps[R.i]); },
  runMiss: el => { if (!R) return; R.missed = true; el.textContent = 'Ripetizione segnata come mancata'; el.disabled = true; },
  runQuit: () => { if (confirm('Interrompere l\'allenamento? I risultati di questo esercizio non verranno salvati.')) endRun(); },
  rate: el => {
    const n = Number(el.dataset.id); R.quality = n;
    document.querySelectorAll('.stars button').forEach((b, i) => b.classList.toggle('on', i < n));
    $('#r-qlbl').textContent = QL[n]; $('#r-save').disabled = false;
  },
  saveRun,
  runNext: () => { R.qi++; loadExercise(); },
  runDone: endRun,
  editName: () => {
    $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Cambia nome">
      <h2>Come vuoi essere chiamato?</h2>
      <form data-form="rename"><label for="rn">Nome</label><input id="rn" maxlength="30" value="${esc(getName())}" required>
      <div class="row" style="margin-top:20px"><button type="button" class="btn ghost grow" data-act="closeModal">Annulla</button><button class="btn pri grow" type="submit">Salva</button></div></form></div></div>`;
  },
  deleteAccount: () => {
    $('#modal').innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Elimina account">
      <h2>Eliminare l'account?</h2>
      <p class="mut" style="margin-top:6px">Verranno cancellati in modo definitivo account, esercizi, punteggi e trofei.</p>
      <label for="del">Per confermare scrivi ELIMINA</label><input id="del" autocomplete="off" autocapitalize="characters">
      <div class="row" style="margin-top:20px"><button class="btn ghost grow" data-act="closeModal">Annulla</button><button class="btn warn grow" data-act="confirmDelete">Elimina</button></div></div></div>`;
  },
  confirmDelete: async el => {
    if ($('#del').value.trim().toUpperCase() !== 'ELIMINA') return toast('Scrivi ELIMINA per confermare', 'err');
    el.disabled = true;
    const { error } = await sb.rpc('delete_my_account');
    if (error) { el.disabled = false; return toast('Eliminazione non riuscita. Controlla di aver eseguito lo SQL "delete_account.sql" su Supabase.', 'err'); }
    closeModal();
    try { await sb.auth.signOut({ scope: 'local' }); } catch { /* utente già rimosso */ }
    S.user = null; S.sessions = []; S.customs = []; S.trophies = {}; S.authMode = 'in';
    location.hash = '#/home'; render(); toast('Account eliminato.');
  },
  authMode: el => { S.authMode = el.dataset.id; render(); },
  forgot: async () => {
    const email = $('#em')?.value.trim();
    if (!email) return toast('Scrivi la tua email, poi tocca "Password dimenticata?"', 'err');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    toast(error ? authMsg(error) : 'Ti abbiamo mandato un\'email per reimpostare la password.', error ? 'err' : '');
  },
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
document.addEventListener('submit', async e => {
  const f = e.target.dataset?.form; if (!f) return;
  e.preventDefault();
  if (f === 'auth') authDo(S.authMode === 'up' ? 'up' : 'in');
  if (f === 'name') {
    try { await setName($('#nm').value); render(); } catch (err) { toast(err.message, 'err'); }
  }
  if (f === 'rename') {
    try { await setName($('#rn').value); closeModal(); render(); toast('Nome aggiornato'); } catch (err) { toast(err.message, 'err'); }
  }
  if (f === 'recover') {
    const password = $('#np').value;
    const { error } = await sb.auth.updateUser({ password });
    if (error) return toast(authMsg(error), 'err');
    S.recovery = false; toast('Password aggiornata.'); location.hash = '#/home'; render();
  }
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
  sb.auth.onAuthStateChange((ev, session) => {
    const u = session?.user || null;
    if (ev === 'PASSWORD_RECOVERY') S.recovery = true;
    if (booted && (u?.id || null) === (S.user?.id || null)) { if (ev === 'PASSWORD_RECOVERY') setTimeout(render, 0); return; }
    const wasOut = !S.user;
    booted = true; S.user = u;
    setTimeout(async () => { // fuori dal callback, come raccomanda Supabase
      await loadData();
      if (u) await maybeImportLocal();
      if (u) loadEndImages(); else S.endImgs = [];
      S.ready = true;
      if (u) await checkTrophies();
      if (u && wasOut) location.hash = '#/home';
      render();
    }, 0);
  });
  render(); // mostra subito il caricamento
} else {
  boot();
}
})();
