/* Chord Practice — spaced-repetition note drilling.
 * Vanilla JS, state persisted in localStorage. No build step. */

'use strict';

/* =========================================================================
 * MUSIC THEORY
 * ========================================================================= */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Roots ordered easy -> hard by number of accidentals in the key signature.
// `tier` drives the spaced-repetition difficulty progression.
const ROOTS = [
  { name: 'C',  letter: 'C', pc: 0,  tier: 0 },
  { name: 'G',  letter: 'G', pc: 7,  tier: 1 },
  { name: 'F',  letter: 'F', pc: 5,  tier: 1 },
  { name: 'D',  letter: 'D', pc: 2,  tier: 2 },
  { name: 'B♭', letter: 'B', pc: 10, tier: 2 },
  { name: 'A',  letter: 'A', pc: 9,  tier: 3 },
  { name: 'E♭', letter: 'E', pc: 3,  tier: 3 },
  { name: 'E',  letter: 'E', pc: 4,  tier: 4 },
  { name: 'A♭', letter: 'A', pc: 8,  tier: 4 },
  { name: 'B',  letter: 'B', pc: 11, tier: 5 },
  { name: 'D♭', letter: 'D', pc: 1,  tier: 5 },
  { name: 'F♯', letter: 'F', pc: 6,  tier: 6 },
  { name: 'G♭', letter: 'G', pc: 6,  tier: 6 },
];
const ROOT_BY_NAME = Object.fromEntries(ROOTS.map(r => [r.name, r]));
// Root names offered in the Triads settings (one per canonical spelling).
const TRIAD_ROOT_NAMES = ROOTS.map(r => r.name);
const TRIAD_QUALITY_ORDER = ['major', 'minor', 'dim'];

// Semitones above the root for scale degrees 1..7. Each chord quality is tied
// to its parent scale so that (a) the 3/5/7 come out as the real chord tones
// and (b) the non-chord 2/4/6 are spelled sensibly.
const SCALES = {
  major:   [0, 2, 4, 5, 7, 9, 11],  // Ionian
  minor:   [0, 2, 3, 5, 7, 8, 10],  // Aeolian (natural minor)
  maj7:    [0, 2, 4, 5, 7, 9, 11],  // Ionian
  dom7:    [0, 2, 4, 5, 7, 9, 10],  // Mixolydian
  min7:    [0, 2, 3, 5, 7, 8, 10],  // Aeolian
  halfdim: [0, 1, 3, 5, 6, 8, 10],  // Locrian
  dim:     [0, 1, 3, 5, 6, 8, 10],  // Locrian (diminished triad: ♭3, ♭5)
};

const QUALITIES = {
  major:   { label: 'major',           mode: 'triads', rank: 0 },
  minor:   { label: 'minor',           mode: 'triads', rank: 1 },
  dim:     { label: 'diminished',      mode: 'triads', rank: 2 },
  maj7:    { label: 'major 7',         mode: 'chords', rank: 0 },
  dom7:    { label: 'dominant 7',      mode: 'chords', rank: 1 },
  min7:    { label: 'minor 7',         mode: 'chords', rank: 2 },
  halfdim: { label: 'half-diminished', mode: 'chords', rank: 3 },
};
const MODE_QUALITIES = {
  triads: ['major', 'minor', 'dim'],
  chords: ['maj7', 'dom7', 'min7', 'halfdim'],
};
// Chord tones (as scale degrees) that get spelled out in the feedback line.
const CHORD_TONES = { triads: [1, 3, 5], chords: [1, 3, 5, 7] };

// Notation variants for each quality. The chord symbol is root + a randomly
// chosen suffix, so the same chord shows up written different ways over time —
// training recognition of the symbols used across different contexts.
const NOTATIONS = {
  major:   ['maj', 'Maj', ' major', ' Major'],
  minor:   ['m', 'min', 'mi', ' minor'],
  dim:     ['dim', '°', 'o', ' dim', ' diminished'],
  maj7:    ['maj7', 'Maj7', 'M7', '△7', 'ma7'],
  dom7:    ['7', 'dom7'],
  min7:    ['m7', 'min7', 'mi7', '-7'],
  halfdim: ['ø7', 'ø', 'm7♭5', 'm7(♭5)', '-7♭5', 'min7♭5'],
};

function chordSymbol(entry) {
  const variants = NOTATIONS[entry.quality];
  return entry.root.name + variants[Math.floor(Math.random() * variants.length)];
}

const DEGREE_OPTIONS = { triads: [2, 3, 4, 5], chords: [2, 3, 4, 5, 6, 7], songs: [1, 2, 3, 4, 5, 6, 7] };
// Priority order used when ranking difficulty of multiple selected degrees.
const DEGREE_PRIORITY = [3, 5, 7, 2, 4, 6];

function ordinal(d) {
  return d + ({ 1: 'st', 2: 'nd', 3: 'rd' }[d] || 'th');
}

// Spell scale-degree `degree` of `root` for `quality`.
// Returns { letter, acc } where acc is the accidental offset in semitones
// (+1 = one sharp, -1 = one flat, etc.) plus display/plain text forms.
function spell(root, quality, degree) {
  const semis = SCALES[quality][degree - 1];
  const li = LETTERS.indexOf(root.letter);
  const letter = LETTERS[(li + (degree - 1)) % 7];
  const naturalPc = LETTER_PC[letter];
  const targetPc = (((root.pc + semis) % 12) + 12) % 12;
  let acc = targetPc - naturalPc;
  while (acc > 6) acc -= 12;
  while (acc < -6) acc += 12;
  return {
    letter,
    acc,
    pc: targetPc,
    text: letter + accToText(acc, false),
    display: letter + accToText(acc, true),
  };
}

function accToText(acc, pretty) {
  const sharp = pretty ? '♯' : '#';
  const flat = pretty ? '♭' : 'b';
  if (acc > 0) return sharp.repeat(acc);
  if (acc < 0) return flat.repeat(-acc);
  return '';
}

// Parse a typed answer into { letter, acc, pc } or { invalid: true } or null.
// Accepts: C  c  Eb  e flat  E♭  f#  f sharp  gx  g##  a double flat, etc.
function parseAnswer(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  const m = s.match(/^([a-g])\s*(.*)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  let rest = m[2].replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');
  let acc;
  if (rest === '' || rest === 'natural' || rest === 'nat') acc = 0;
  else if (rest === '#' || rest === 'sharp') acc = 1;
  else if (rest === '##' || rest === 'x' || rest === 'doublesharp') acc = 2;
  else if (rest === 'b' || rest === 'flat') acc = -1;
  else if (rest === 'bb' || rest === 'doubleflat') acc = -2;
  else return { invalid: true };
  return { letter, acc, pc: (((LETTER_PC[letter] + acc) % 12) + 12) % 12 };
}

/* =========================================================================
 * KEYS — the 12 major and 12 minor keys exercises can be drawn from. All modes
 * (and worksheets) draw only chords diatonic to the checked keys.
 * ========================================================================= */

const MAJOR_KEY_TONICS = [
  { name: 'C', letter: 'C', pc: 0 }, { name: 'G', letter: 'G', pc: 7 }, { name: 'D', letter: 'D', pc: 2 },
  { name: 'A', letter: 'A', pc: 9 }, { name: 'E', letter: 'E', pc: 4 }, { name: 'B', letter: 'B', pc: 11 },
  { name: 'F♯', letter: 'F', pc: 6 }, { name: 'D♭', letter: 'D', pc: 1 }, { name: 'A♭', letter: 'A', pc: 8 },
  { name: 'E♭', letter: 'E', pc: 3 }, { name: 'B♭', letter: 'B', pc: 10 }, { name: 'F', letter: 'F', pc: 5 },
];
const MINOR_KEY_TONICS = [
  { name: 'A', letter: 'A', pc: 9 }, { name: 'E', letter: 'E', pc: 4 }, { name: 'B', letter: 'B', pc: 11 },
  { name: 'F♯', letter: 'F', pc: 6 }, { name: 'C♯', letter: 'C', pc: 1 }, { name: 'G♯', letter: 'G', pc: 8 },
  { name: 'E♭', letter: 'E', pc: 3 }, { name: 'B♭', letter: 'B', pc: 10 }, { name: 'F', letter: 'F', pc: 5 },
  { name: 'C', letter: 'C', pc: 0 }, { name: 'G', letter: 'G', pc: 7 }, { name: 'D', letter: 'D', pc: 2 },
];
const KEYS = [].concat(
  MAJOR_KEY_TONICS.map(t => ({ id: 'maj-' + t.name, mode: 'major', tonic: t, label: t.name })),
  MINOR_KEY_TONICS.map(t => ({ id: 'min-' + t.name, mode: 'minor', tonic: t, label: t.name }))
);
const ALL_KEY_IDS = KEYS.map(k => k.id);

// Diatonic chord qualities by scale degree (1..7).
const SEVENTH_QUALITIES = {
  major: ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'halfdim'],
  minor: ['min7', 'halfdim', 'maj7', 'min7', 'min7', 'maj7', 'dom7'],
};
const TRIAD_QUALITIES = {
  major: ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim'],
  minor: ['minor', 'dim', 'major', 'minor', 'minor', 'major', 'major'],
};

// A root spelling to avoid (enharmonic natural or double accidental); re-spell to
// the plain natural, e.g. C♭ -> B, E♯ -> F.
const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const NATURAL_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
function isAwkwardSpelling(note) {
  return (NATURAL_PCS.has(note.pc) && note.acc !== 0) || Math.abs(note.acc) >= 2;
}
function cleanRoot(note) {
  if (isAwkwardSpelling(note) && NATURAL_LETTER[note.pc]) {
    const l = NATURAL_LETTER[note.pc];
    return { name: l, letter: l, pc: note.pc };
  }
  return { name: note.display, letter: note.letter, pc: note.pc };
}

// Diatonic chords of a key: kind 'triad' (major/minor, skips diminished) or
// 'seventh' (maj7/min7/dom7/halfdim). Roots spelled for the key, cleaned up.
function diatonicChords(key, kind) {
  const quals = kind === 'triad' ? TRIAD_QUALITIES[key.mode] : SEVENTH_QUALITIES[key.mode];
  const out = [];
  for (let d = 1; d <= 7; d++) {
    const q = quals[d - 1];
    if (!q) continue;
    out.push({ root: cleanRoot(spell(key.tonic, key.mode, d)), quality: q });
  }
  return out;
}

function enabledKeys() {
  const ids = new Set((state.prefs.keys && state.prefs.keys.length) ? state.prefs.keys : ALL_KEY_IDS);
  return KEYS.filter(k => ids.has(k.id));
}

// Union of the diatonic chords of every enabled key (deduped by root+quality).
function allowedChords(kind) {
  const map = new Map();
  for (const key of enabledKeys()) {
    for (const ch of diatonicChords(key, kind)) map.set(ch.root.name + '|' + ch.quality, ch);
  }
  return [...map.values()];
}

// Difficulty tier for a root name (for the spaced-repetition ordering).
function rootTier(rootName) {
  const r = ROOT_BY_NAME[rootName];
  if (r) return r.tier;
  return 4 + (rootName.match(/[♯♭]/g) || []).length; // e.g. C♯ / G♯ from sharp keys
}

/* =========================================================================
 * STATE / PERSISTENCE
 * ========================================================================= */

// Shown in the header so you can confirm an update landed. Keep in sync with
// CACHE in sw.js — bump both on every deploy.
const APP_VERSION = 'v38';

const STORAGE_KEY = 'chordpractice.v1';

const DEFAULT_STATE = () => ({
  prefs: {
    mode: 'triads',
    triadDegrees: [3],
    triadRoots: {
      major: TRIAD_ROOT_NAMES.slice(),
      minor: TRIAD_ROOT_NAMES.slice(),
      dim: TRIAD_ROOT_NAMES.slice(),
    },
    chordDegrees: [3],
    songDegrees: [3],
    songTitle: null,
    acceptEnharmonic: true,
    sound: true,
    changesProgressions: ['random'],
    changesLineModes: ['ascending', 'descending'],
    changesInclude7th: true,
    changesAnchors: [1, 3, 5],
    keys: ALL_KEY_IDS.slice(),
  },
  tick: 0,
  items: {}, // key "root|quality|degree" -> item state
  changes: { notesAttempted: 0, notesCorrect: 0, rounds: 0 },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE();
    const parsed = JSON.parse(raw);
    const base = DEFAULT_STATE();
    return {
      prefs: Object.assign(base.prefs, parsed.prefs || {}),
      tick: parsed.tick || 0,
      items: parsed.items || {},
      changes: Object.assign(base.changes, parsed.changes || {}),
    };
  } catch (e) {
    console.warn('Could not load saved state, starting fresh.', e);
    return DEFAULT_STATE();
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Could not save state.', e); }
  }, 120);
}

function itemKey(rootName, quality, degree) { return `${rootName}|${quality}|${degree}`; }

function getItem(rootName, quality, degree) {
  const key = itemKey(rootName, quality, degree);
  if (!state.items[key]) {
    state.items[key] = {
      level: 0, dueTick: 0, attempts: 0, correct: 0, streak: 0, introduced: false,
    };
  }
  return state.items[key];
}

/* =========================================================================
 * SPACED REPETITION ENGINE
 * ========================================================================= */

const LEVEL_INTERVAL = [1, 2, 3, 5, 8, 13, 21, 34, 55]; // ticks until next due, by level
const MAX_LEVEL = LEVEL_INTERVAL.length - 1;
const MASTERED_LEVEL = 5;
const LEARN_CAP = 8;      // max simultaneous "still learning" (level<2) items in flight
const FRONTIER_BASE = 6;  // how many of the hardest-ordered items are unlocked at the start

function currentDegrees() {
  if (state.prefs.mode === 'triads') return state.prefs.triadDegrees;
  if (state.prefs.mode === 'songs') return state.prefs.songDegrees;
  return state.prefs.chordDegrees;
}

// All (root, quality, degree) combos allowed by the current mode + selected
// degrees, sorted easiest -> hardest. Index in this list = difficulty rank.
function buildPool() {
  const degrees = currentDegrees();
  const kind = state.prefs.mode === 'triads' ? 'triad' : 'seventh';
  const pool = [];
  for (const ch of allowedChords(kind)) {
    for (const d of degrees) {
      pool.push({
        key: itemKey(ch.root.name, ch.quality, d),
        root: ch.root, quality: ch.quality, degree: d,
        sort: [rootTier(ch.root.name), QUALITIES[ch.quality].rank, DEGREE_PRIORITY.indexOf(d), ch.root.pc],
      });
    }
  }
  pool.sort((a, b) => {
    for (let i = 0; i < a.sort.length; i++) {
      if (a.sort[i] !== b.sort[i]) return a.sort[i] - b.sort[i];
    }
    return 0;
  });
  pool.forEach((p, i) => { p.diffIndex = i; });
  return pool;
}

// Choose the next question. Returns a pool entry, or null if the pool is empty.
function selectNext() {
  const pool = buildPool();
  if (pool.length === 0) return null;

  const introduced = pool.filter(p => getItem(p.root.name, p.quality, p.degree).introduced);
  const due = introduced
    .filter(p => getItem(p.root.name, p.quality, p.degree).dueTick <= state.tick)
    .sort((a, b) => getItem(a.root.name, a.quality, a.degree).dueTick
                  - getItem(b.root.name, b.quality, b.degree).dueTick);

  const learning = introduced.filter(p => getItem(p.root.name, p.quality, p.degree).level < 2).length;
  const mastered = introduced.filter(p => getItem(p.root.name, p.quality, p.degree).level >= MASTERED_LEVEL).length;

  // The more you master, the further into the (hard) list unlocks.
  const frontier = FRONTIER_BASE + mastered;
  const nextNew = pool.find(p => !getItem(p.root.name, p.quality, p.degree).introduced && p.diffIndex < frontier);
  const canIntroduce = !!nextNew && learning < LEARN_CAP;

  // Mix in fresh material even while reviews are pending, so difficulty ramps up.
  const introduceNow = canIntroduce && (due.length === 0 || Math.random() < 0.25);
  if (introduceNow) {
    const it = getItem(nextNew.root.name, nextNew.quality, nextNew.degree);
    it.introduced = true;
    it.dueTick = state.tick;
    return nextNew;
  }
  if (due.length) return due[0];
  if (canIntroduce) {
    const it = getItem(nextNew.root.name, nextNew.quality, nextNew.degree);
    it.introduced = true;
    it.dueTick = state.tick;
    return nextNew;
  }
  // Nothing due yet and nothing new to add: jump the clock to the soonest review.
  if (introduced.length) {
    const soonest = introduced.slice().sort((a, b) =>
      getItem(a.root.name, a.quality, a.degree).dueTick - getItem(b.root.name, b.quality, b.degree).dueTick)[0];
    state.tick = getItem(soonest.root.name, soonest.quality, soonest.degree).dueTick;
    return soonest;
  }
  return pool[0];
}

function grade(entry, correct) {
  const it = getItem(entry.root.name, entry.quality, entry.degree);
  it.introduced = true;
  it.attempts += 1;
  if (correct) {
    it.correct += 1;
    it.streak += 1;
    it.level = Math.min(MAX_LEVEL, it.level + 1);
  } else {
    it.streak = 0;
    it.level = Math.max(0, it.level - 2);
  }
  it.dueTick = state.tick + LEVEL_INTERVAL[it.level];
  state.tick += 1;
  save();
}

/* =========================================================================
 * UI
 * ========================================================================= */

const $ = sel => document.querySelector(sel);
const el = {
  practiceCard: $('#practice-card'),
  promptQuality: $('#prompt-quality'),
  promptRoot: $('#prompt-root'),
  promptAsk: $('#prompt-ask'),
  form: $('#answer-form'),
  input: $('#answer-input'),
  submit: $('#submit-btn'),
  feedback: $('#feedback'),
  metaLevel: $('#meta-level'),
  metaStreak: $('#meta-streak'),
  skip: $('#skip-btn'),
  emptyPool: $('#empty-pool'),
  noteKeys: $('#note-keys'),
  singlePrompt: $('#single-prompt'),
  changesPrompt: $('#changes-prompt'),
  changesInstruction: $('#changes-instruction'),
  changesStrip: $('#changes-strip'),
  triadPrompt: $('#triad-prompt'),
  triadSymbol: $('#triad-symbol'),
  triadDirection: $('#triad-direction'),
  triadStrip: $('#triad-strip'),
  songsPrompt: $('#songs-prompt'),
  songsGrid: $('#songs-grid'),
  songTitle: $('#song-title'),
  songSub: $('#song-sub'),
  songPicker: $('#song-picker'),
  songList: $('#song-list'),
  songSearch: $('#song-search'),
  metaRow: $('.practice-meta'),
};

let current = null;         // current pool entry
let phase = 'awaiting';     // 'awaiting' | 'feedback'
let triadRound = null;      // current Triad-mode round

/* ---- On-screen note input: a circle-of-fifths ring ---- */

// 12 segments clockwise from the top: C, G, D, A, E, B, F♯/G♭ (bottom),
// D♭, A♭, E♭ (left), B♭, F. Enharmonic segments are a single button; the
// actual spelling filled is chosen at tap time to match the current chord's
// key signature (see accidentalPreference).
const CIRCLE_OF_FIFTHS = [
  { pc: 0,  natural: 'C' },
  { pc: 7,  natural: 'G' },
  { pc: 2,  natural: 'D' },
  { pc: 9,  natural: 'A' },
  { pc: 4,  natural: 'E' },
  { pc: 11, natural: 'B' },
  { pc: 6,  sharp: 'F#', flat: 'Gb' },
  { pc: 1,  sharp: 'C#', flat: 'Db' },
  { pc: 8,  sharp: 'G#', flat: 'Ab' },
  { pc: 3,  sharp: 'D#', flat: 'Eb' },
  { pc: 10, sharp: 'A#', flat: 'Bb' },
  { pc: 5,  natural: 'F' },
];

const isDesktop = () => window.matchMedia('(pointer: fine)').matches;
// Focus the input only on desktop, so tapping the on-screen keys on a phone
// doesn't pop the soft keyboard. (Tapping the input still opens it.)
function focusInput() { if (isDesktop()) el.input.focus(); }

// Does the current chord spell its accidentals as flats or sharps? Diatonic
// modes are all-flat or all-sharp, so counting the degrees settles it.
function accidentalPreference(entry) {
  let flats = 0, sharps = 0;
  for (let d = 1; d <= 7; d++) {
    const acc = spell(entry.root, entry.quality, d).acc;
    if (acc < 0) flats++;
    else if (acc > 0) sharps++;
  }
  if (sharps > flats) return 'sharp';
  return 'flat'; // ties / no accidentals (e.g. C major) default to flats
}

function toGlyph(note) { return note.replace('#', '♯').replace('b', '♭'); }

const SVG_NS = 'http://www.w3.org/2000/svg';
// Point on a circle at `clockDeg` (0 = top / 12 o'clock, increasing clockwise).
function ringPoint(cx, cy, r, clockDeg) {
  const t = clockDeg * Math.PI / 180;
  return [cx + r * Math.sin(t), cy - r * Math.cos(t)];
}
// Path for a donut wedge (annular sector) spanning a0..a1 (clock degrees).
function annularSector(cx, cy, rIn, rOut, a0, a1) {
  const [x0o, y0o] = ringPoint(cx, cy, rOut, a0);
  const [x1o, y1o] = ringPoint(cx, cy, rOut, a1);
  const [x1i, y1i] = ringPoint(cx, cy, rIn, a1);
  const [x0i, y0i] = ringPoint(cx, cy, rIn, a0);
  const large = (a1 - a0) > 180 ? 1 : 0;
  return `M ${x0o.toFixed(2)} ${y0o.toFixed(2)}`
    + ` A ${rOut} ${rOut} 0 ${large} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)}`
    + ` L ${x1i.toFixed(2)} ${y1i.toFixed(2)}`
    + ` A ${rIn} ${rIn} 0 ${large} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)} Z`;
}

// One circle-of-fifths segment (a <g> holding the wedge + its label(s)).
function noteKeySegment(k, i, geom) {
  const { cx, cy, rIn, rOut } = geom;
  const rMid = (rIn + rOut) / 2;
  const center = i * 30;                 // segment 0 sits at the top
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'nkey ' + (k.natural ? 'nat' : 'acc'));
  g.dataset.pc = k.pc;

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'wedge');
  path.setAttribute('d', annularSector(cx, cy, rIn, rOut, center - 15, center + 15));
  g.appendChild(path);

  const [lx, ly] = ringPoint(cx, cy, rMid, center);
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', lx.toFixed(2));
  text.setAttribute('y', ly.toFixed(2));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'lbl');
  if (k.natural) {
    g.dataset.note = k.natural;
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = k.natural;
  } else {
    g.dataset.sharp = k.sharp;
    g.dataset.flat = k.flat;
    const flat = document.createElementNS(SVG_NS, 'tspan');
    flat.setAttribute('x', lx.toFixed(2)); flat.setAttribute('dy', '-0.15em');
    flat.textContent = toGlyph(k.flat);
    const sharp = document.createElementNS(SVG_NS, 'tspan');
    sharp.setAttribute('x', lx.toFixed(2)); sharp.setAttribute('dy', '1.15em');
    sharp.setAttribute('class', 'enh'); sharp.textContent = toGlyph(k.sharp);
    text.appendChild(flat); text.appendChild(sharp);
  }
  g.appendChild(text);
  return g;
}

// The chord whose key signature governs enharmonic key spelling right now:
// the current single-mode item, or the current chord of a Changes line.
function activeChordForKeys() {
  if (state.prefs.mode === 'changes') {
    return changesRound ? changesRound.chords[changesRound.idx] : null;
  }
  if (state.prefs.mode === 'triads') {
    return triadRound ? triadRound.chord : null;
  }
  return current;
}

// The input the on-screen ring currently fills: the shared box normally, or the
// current song cell in Songs mode. Returns null when no entry is accepted.
function activeNoteInput() {
  if (state.prefs.mode === 'songs') {
    return (songState && !songState.done) ? songState.cells[songState.idx] : null;
  }
  return (phase === 'awaiting' && activeChordForKeys()) ? el.input : null;
}
function focusActiveInput() {
  if (!isDesktop()) return;
  const input = activeNoteInput();
  if (input) input.focus();
}

// Resolve which note string a key fills (enharmonic keys pick by key signature).
function keyNote(btn) {
  if (btn.dataset.note) return btn.dataset.note;
  let pref = 'flat';
  if (state.prefs.mode === 'songs') {
    const ct = (songState && !songState.done) ? songState.chords[songState.idx].t : null;
    if (ct) pref = songAccidentalPreference(ct);
  } else {
    const ctx = activeChordForKeys();
    if (ctx) pref = accidentalPreference(ctx);
  }
  return pref === 'flat' ? btn.dataset.flat : btn.dataset.sharp;
}

function buildNoteKeys() {
  const geom = { cx: 100, cy: 100, rIn: 47, rOut: 97 };
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('class', 'cof');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Circle of fifths note input');
  CIRCLE_OF_FIFTHS.forEach((k, i) => svg.appendChild(noteKeySegment(k, i, geom)));

  // Check/submit button in the centre hole of the ring (works in every mode —
  // the main way to submit on mobile, where the soft keyboard is suppressed).
  const check = document.createElementNS(SVG_NS, 'g');
  check.setAttribute('class', 'cof-check');
  check.setAttribute('role', 'button');
  check.setAttribute('aria-label', 'Check answer');
  const cc = document.createElementNS(SVG_NS, 'circle');
  cc.setAttribute('cx', geom.cx); cc.setAttribute('cy', geom.cy); cc.setAttribute('r', geom.rIn - 9);
  const ct = document.createElementNS(SVG_NS, 'text');
  ct.setAttribute('x', geom.cx); ct.setAttribute('y', geom.cy);
  ct.setAttribute('text-anchor', 'middle'); ct.setAttribute('dominant-baseline', 'central');
  ct.setAttribute('class', 'cof-check-lbl'); ct.textContent = 'Check';
  check.appendChild(cc); check.appendChild(ct);
  svg.appendChild(check);

  el.noteKeys.appendChild(svg);

  // Keep input focus on desktop (so Enter still submits) by not letting a
  // control steal it on mousedown; touch just fires click.
  el.noteKeys.addEventListener('mousedown', (e) => {
    if (e.target.closest('.nkey, .cof-check')) e.preventDefault();
  });
  el.noteKeys.addEventListener('click', (e) => {
    if (e.target.closest('.cof-check')) { checkAnswer(); focusActiveInput(); return; }
    const btn = e.target.closest('.nkey');
    if (!btn) return;
    const input = activeNoteInput();
    if (!input) return;
    input.value = keyNote(btn);
    input.classList.remove('correct', 'wrong');
    updateKeySelection();
    focusActiveInput();
  });
}

// Submit / advance from the current mode's input — shared by the form, the
// Enter key, and the centre Check button on the ring.
function checkAnswer() {
  if (state.prefs.mode === 'songs') {
    if (songState && !songState.done) submitSongCell(songState.idx);
    return;
  }
  if (phase !== 'awaiting') { nextQuestion(); return; }
  if (state.prefs.mode === 'changes') submitChangesNote();
  else if (state.prefs.mode === 'triads') submitTriadNote();
  else submitAnswer();
}

// Highlight the key matching whatever is currently in the active input (typed or
// tapped), compared by pitch class so either spelling lights up its enharmonic key.
function updateKeySelection() {
  const input = (state.prefs.mode === 'songs')
    ? (songState && !songState.done ? songState.cells[songState.idx] : null)
    : el.input;
  const parsed = input ? parseAnswer(input.value) : null;
  const pc = parsed && !parsed.invalid ? parsed.pc : null;
  el.noteKeys.querySelectorAll('.nkey').forEach(b =>
    b.classList.toggle('sel', pc !== null && Number(b.dataset.pc) === pc));
}

/* =========================================================================
 * SONGS MODE — practice chord-tone spelling over real tunes.
 * Chords come from an iRealPro playlist (pre-parsed into songs.json). Each
 * chord shows a randomly-chosen degree to name; get it right and the cursor
 * jumps to the next chord. Chord-quality -> scale/spelling logic is ported
 * from the companion song-practice app (TPC-based for correct enharmonics).
 * ========================================================================= */

// Parent scales as {s: semitone offset, t: tonal-pitch-class offset} per degree.
const SONG_SCALES = {
  dorian:   [{ s: 0, t: 0 }, { s: 2, t: 2 }, { s: 3, t: -3 }, { s: 5, t: -1 }, { s: 7, t: 1 }, { s: 9, t: 3 }, { s: 10, t: -2 }],
  ionian:   [{ s: 0, t: 0 }, { s: 2, t: 2 }, { s: 4, t: 4 }, { s: 5, t: -1 }, { s: 7, t: 1 }, { s: 9, t: 3 }, { s: 11, t: 5 }],
  mixo:     [{ s: 0, t: 0 }, { s: 2, t: 2 }, { s: 4, t: 4 }, { s: 5, t: -1 }, { s: 7, t: 1 }, { s: 9, t: 3 }, { s: 10, t: -2 }],
  locrian:  [{ s: 0, t: 0 }, { s: 1, t: -5 }, { s: 3, t: -3 }, { s: 5, t: -1 }, { s: 6, t: -6 }, { s: 8, t: -4 }, { s: 10, t: -2 }],
  melmin:   [{ s: 0, t: 0 }, { s: 2, t: 2 }, { s: 3, t: -3 }, { s: 5, t: -1 }, { s: 7, t: 1 }, { s: 9, t: 3 }, { s: 11, t: 5 }],
  // 8-note symmetric scales — degree lookup goes through songDiatonicIndex.
  wh_dim:   [{ s: 0, t: 0 }, { s: 2, t: 2 }, { s: 3, t: -3 }, { s: 5, t: -1 }, { s: 6, t: -6 }, { s: 8, t: -4 }, { s: 9, t: 3 }, { s: 11, t: 5 }],
  hw_dim:   [{ s: 0, t: 0 }, { s: 1, t: -5 }, { s: 3, t: -3 }, { s: 4, t: 4 }, { s: 6, t: 6 }, { s: 7, t: 1 }, { s: 9, t: 3 }, { s: 10, t: -2 }],
};
const SONG_HW_REMAP = [0, 1, 3, 4, 5, 6, 7];

// Map a diatonic degree index (0..6) to the actual index in an 8-note scale.
function songDiatonicIndex(d, scale) {
  if (!scale || scale.length !== 8) return d;
  const sig = scale.map(x => x.s).join(',');
  const oct = Math.floor(d / 7), within = ((d % 7) + 7) % 7;
  if (sig === '0,1,3,4,6,7,9,10') return SONG_HW_REMAP[within] + oct * 8; // half-whole (7b9)
  return within + oct * 8; // whole-half (dim7)
}

function songParseRoot(chordText) {
  const L = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const T = { C: 14, D: 16, E: 18, F: 13, G: 15, A: 17, B: 19 };
  const m = chordText.match(/^([A-Ga-g])([#♯])?([b♭])?/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  let semi = L[letter], tpc = T[letter];
  if (semi === undefined) return null;
  if (m[2]) { semi++; tpc += 7; }
  if (m[3]) { semi--; tpc -= 7; }
  return { pc: ((semi % 12) + 12) % 12, tpc };
}

// Pick the parent scale for a chord quality (mirrors song-practice's exGetScale).
function songGetScale(chordText) {
  const q = chordText.replace(/^[A-Ga-g][#♯b♭]?/, '');
  if (/[øØ]/.test(q)) return SONG_SCALES.locrian;
  if (/m7[b♭]5|min7[b♭]5|mi7[b♭]5/i.test(q)) return SONG_SCALES.locrian;
  if (/^h/i.test(q)) return SONG_SCALES.locrian;
  if (/dim|°/i.test(q)) return SONG_SCALES.wh_dim;
  if (/^o/i.test(q)) return SONG_SCALES.wh_dim;
  if (/^(m(?!a)|min|mi|\-|−)/i.test(q) && /maj|ma|Δ|∆|\^/i.test(q)) return SONG_SCALES.melmin;
  if (/maj|ma/i.test(q)) return SONG_SCALES.ionian;
  if (/^M([0-9]|$)/.test(q)) return SONG_SCALES.ionian;
  if (/[Δ∆\^]/.test(q)) return SONG_SCALES.ionian;
  if (/^m|^-|^−/i.test(q)) return SONG_SCALES.dorian;
  if (/^6/.test(q)) return SONG_SCALES.ionian;
  if (/^[0-9]/.test(q) && /[b♭]9/.test(q)) return SONG_SCALES.hw_dim;
  if (/^[0-9]/.test(q)) return SONG_SCALES.mixo;
  if (/sus/i.test(q)) return SONG_SCALES.mixo;
  if (/aug|\+/i.test(q)) return SONG_SCALES.ionian;
  return SONG_SCALES.ionian;
}

// Collapse awkward enharmonics (double accidentals, Cb/Fb/E#/B#) to a plainer
// spelling on the same pitch class — same rules as the rest of the app.
function songNormEnh(tpc) {
  const idx = (((tpc - 13) % 7) + 7) % 7;
  const acc = (tpc - 13 - idx) / 7;
  if (acc >= 2) tpc -= 12; else if (acc <= -2) tpc += 12;
  if (tpc === 7) return 19;   // Cb -> B
  if (tpc === 6) return 18;   // Fb -> E
  if (tpc === 25) return 13;  // E# -> F
  if (tpc === 26) return 14;  // B# -> C
  return tpc;
}
function songTpcName(tpc) {
  tpc = songNormEnh(tpc);
  const letters = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const idx = (((tpc - 13) % 7) + 7) % 7;
  const name = letters[idx];
  const acc = (tpc - 13 - idx) / 7;
  if (acc <= -2) return name + '♭♭';
  if (acc === -1) return name + '♭';
  if (acc === 1) return name + '♯';
  if (acc >= 2) return name + '♯♯';
  return name;
}

// The spelled note + pitch class of scale-degree `degree` (1..7) of a chord.
function songDegreeNote(chordText, degree) {
  const root = songParseRoot(chordText);
  const scale = songGetScale(chordText);
  if (!root) return { pc: 0, display: '?' };
  const idx = songDiatonicIndex(degree - 1, scale);
  const e = scale[idx];
  return { pc: (((root.pc + e.s) % 12) + 12) % 12, display: songTpcName(root.tpc + e.t) };
}

// Does this chord spell its accidentals as sharps or flats? (for the ring)
function songAccidentalPreference(chordText) {
  const root = songParseRoot(chordText);
  const scale = songGetScale(chordText);
  if (!root) return 'flat';
  let sharps = 0, flats = 0;
  for (let d = 0; d < 7; d++) {
    const name = songTpcName(root.tpc + scale[songDiatonicIndex(d, scale)].t);
    if (name.includes('♯')) sharps++; else if (name.includes('♭')) flats++;
  }
  return sharps > flats ? 'sharp' : 'flat';
}

// ---- Songs data + state ----
let SONGS = null;          // array of {title, composer, key, chords:[{t,d}]}
let songsLoading = null;   // in-flight fetch promise
let songState = null;      // { song, chords:[{t,d,degree,pc,answer}], idx, done, cells }

function loadSongsData() {
  if (SONGS) return Promise.resolve(SONGS);
  if (!songsLoading) {
    songsLoading = fetch('songs.json')
      .then(r => r.json())
      .then(data => { SONGS = data; return data; })
      .catch(err => { console.warn('Could not load songs.json', err); SONGS = []; return SONGS; });
  }
  return songsLoading;
}

function findSong(title) {
  if (!SONGS || !title) return null;
  return SONGS.find(s => s.title === title) || null;
}

function songChordHasSeventh(rest) { return /(7|9|11|13)/.test(rest); }

function loadSong(song) {
  const degs = (state.prefs.songDegrees && state.prefs.songDegrees.length) ? state.prefs.songDegrees : [3];
  const chords = [];        // flat, in reading order (grading/cursor order)
  const bars = [];          // array of arrays of global chord indices (measures)
  for (const bar of song.bars) {
    const measure = [];
    for (const c of bar) {
      const degree = pickRand(degs);
      const { pc, display } = songDegreeNote(c.t, degree);
      measure.push(chords.length);
      chords.push({ t: c.t, d: c.d, degree, pc, answer: display });
    }
    bars.push(measure);
  }
  songState = { song, chords, bars, idx: 0, done: false, cells: [] };
  state.prefs.songTitle = song.title;
  save();
  renderSongChart();
}

const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th' };

function buildSongCell(i) {
  const s = songState;
  const ch = s.chords[i];
  const cell = document.createElement('div');
  cell.className = 'song-cell';
  const sym = document.createElement('div');
  sym.className = 'song-chord';
  sym.textContent = ch.d;
  const deg = document.createElement('div');
  deg.className = 'song-deg deg-' + ch.degree;
  deg.textContent = ORDINALS[ch.degree];
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'song-input';
  input.setAttribute('inputmode', 'text');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('aria-label', `${ch.d}, ${ORDINALS[ch.degree]}`);
  input.addEventListener('focus', () => { s.idx = i; updateKeySelection(); });
  input.addEventListener('input', updateKeySelection);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitSongCell(i); }
  });
  if (ch.answered) {           // keep progress across re-renders
    input.value = ch.answer;
    input.readOnly = true;
    cell.classList.add('done');
  }
  cell.appendChild(sym); cell.appendChild(deg); cell.appendChild(input);
  s.cells[i] = input;
  return cell;
}

function renderSongChart() {
  const s = songState;
  el.songTitle.textContent = s.song.title;
  el.songSub.textContent = [s.song.composer, s.song.key && ('key of ' + s.song.key)].filter(Boolean).join('  ·  ');
  el.songsGrid.innerHTML = '';
  s.cells = [];
  // One grid column per measure (the column count per row is set responsively
  // in CSS — 4 / 8 / 12 / 16 measures by screen width). Each measure holds its
  // one or more chords side by side, like a lead sheet.
  s.bars.forEach(measureIdxs => {
    const measure = document.createElement('div');
    measure.className = 'song-measure' + (measureIdxs.length > 1 ? ' multi' : '');
    measureIdxs.forEach(gi => measure.appendChild(buildSongCell(gi)));
    el.songsGrid.appendChild(measure);
  });
  // Resume at the first unanswered chord (progress survives re-renders).
  const firstOpen = s.chords.findIndex(c => !c.answered);
  s.done = firstOpen < 0;
  s.idx = s.done ? 0 : firstOpen;
  highlightSongCell();
  el.feedback.textContent = '';
  focusActiveInput();
  updateSongsKbdLayout();
}

function highlightSongCell() {
  const s = songState;
  s.cells.forEach((inp, i) => {
    inp.closest('.song-cell').classList.toggle('current', i === s.idx && !s.done);
  });
  const cur = s.cells[s.idx];
  if (cur) cur.closest('.song-cell').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function submitSongCell(i) {
  const s = songState;
  if (!s || s.done) return;
  const ch = s.chords[i];
  const input = s.cells[i];
  const parsed = parseAnswer(input.value);
  if (!parsed || parsed.invalid) { flashWrong(input); return; }
  if (parsed.pc !== ch.pc) { flashWrong(input); return; }
  // Correct.
  ch.answered = true;
  input.value = ch.answer;
  input.readOnly = true;
  input.classList.remove('wrong');
  input.closest('.song-cell').classList.add('done');
  playSongChord(ch.t, ch.degree);
  // Advance to the next not-yet-answered cell.
  let next = -1;
  for (let j = i + 1; j < s.chords.length; j++) {
    if (!s.cells[j].readOnly) { next = j; break; }
  }
  if (next < 0) for (let j = 0; j < i; j++) { if (!s.cells[j].readOnly) { next = j; break; } }
  if (next < 0) {
    s.done = true;
    highlightSongCell();
    el.feedback.innerHTML = '<span class="verdict good">Whole song done! 🎉</span>'
      + '<div class="next-hint">Shuffle for new degrees, or pick another song with the folder.</div>';
    return;
  }
  s.idx = next;
  highlightSongCell();
  focusActiveInput();
}

function flashWrong(input) {
  input.classList.remove('wrong');
  // reflow to restart the animation
  void input.offsetWidth;
  input.classList.add('wrong');
}

// Play the chord (low) and the asked degree an octave up — like the other modes.
function playSongChord(chordText, degree) {
  if (!state.prefs.sound) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const root = songParseRoot(chordText);
  const scale = songGetScale(chordText);
  if (!root) return;
  const base = 48 + root.pc; // low (left-hand) register, C3 octave
  const t = ctx.currentTime + 0.03;
  const rest = chordText.replace(/^[A-Ga-g][#♯b♭]?/, '');
  const tones = songChordHasSeventh(rest) ? [1, 3, 5, 7] : [1, 3, 5];
  for (const cd of tones) {
    const e = scale[songDiatonicIndex(cd - 1, scale)];
    playTone(ctx, base + e.s, t, 2.6, 0.13);
  }
  const de = scale[songDiatonicIndex(degree - 1, scale)];
  playTone(ctx, base + de.s + 12, t, 3.0, 0.22);
}

// Reserve space under the scrolling chart for the fixed bottom keyboard (Songs
// mode only), and publish its height so cells scroll clear of it.
function updateSongsKbdLayout() {
  const main = document.querySelector('main');
  if (state.prefs.mode !== 'songs') {
    main.style.paddingBottom = '';
    document.documentElement.style.removeProperty('--kbd-h');
    return;
  }
  const h = el.noteKeys.offsetHeight || 0;
  document.documentElement.style.setProperty('--kbd-h', h + 'px');
  main.style.paddingBottom = (h + 20) + 'px';
}
window.addEventListener('resize', () => { if (state.prefs.mode === 'songs') updateSongsKbdLayout(); });

async function startSongsView() {
  el.singlePrompt.classList.add('hidden');
  el.changesPrompt.classList.add('hidden');
  el.triadPrompt.classList.add('hidden');
  el.songsPrompt.classList.remove('hidden');
  el.form.classList.add('hidden');
  el.metaRow.classList.add('hidden');
  el.emptyPool.classList.add('hidden');
  el.practiceCard.classList.remove('hidden');
  if (!SONGS) {
    el.songTitle.textContent = 'Loading songs…';
    el.songSub.textContent = '';
    await loadSongsData();
    if (state.prefs.mode !== 'songs') return; // user switched away while loading
  }
  if (!SONGS.length) { el.songTitle.textContent = 'No songs available'; return; }
  if (songState) renderSongChart();
  else loadSong(findSong(state.prefs.songTitle) || SONGS[0]);
}

function reshuffleSong() {
  if (songState) loadSong(songState.song);
}

// ---- Song picker modal ----
function openSongPicker() {
  loadSongsData().then(() => {
    el.songPicker.classList.remove('hidden');
    el.songSearch.value = '';
    renderSongList('');
    if (isDesktop()) el.songSearch.focus();
  });
}
function closeSongPicker() { el.songPicker.classList.add('hidden'); }
function renderSongList(filter) {
  const q = filter.trim().toLowerCase();
  el.songList.innerHTML = '';
  const list = (SONGS || []).filter(s =>
    !q || s.title.toLowerCase().includes(q) || (s.composer || '').toLowerCase().includes(q));
  for (const song of list) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'song-row' + (songState && songState.song.title === song.title ? ' active' : '');
    row.innerHTML = `<span class="song-row-title">${song.title}</span>`
      + `<span class="song-row-sub">${song.composer || ''}${song.key ? '  ·  ' + song.key : ''}</span>`;
    row.addEventListener('click', () => { loadSong(song); closeSongPicker(); });
    el.songList.appendChild(row);
  }
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'song-row-empty muted';
    empty.textContent = 'No matching songs.';
    el.songList.appendChild(empty);
  }
}

/* =========================================================================
 * CHANGES MODE — voice-lead a line of chord tones through 4 random 7th chords.
 * Matches song-practice's Chord Tones exercise: each next note is the nearest
 * chord tone strictly in the chosen direction (up/down) from the previous note.
 * ========================================================================= */

const CHORD_QUALITIES = MODE_QUALITIES.chords; // maj7, dom7, min7, halfdim

// Consistent notation within one progression (unlike Chords mode, which
// randomizes per chord). Each scheme spells every quality in one house style.
const NOTATION_SCHEMES = [
  { maj7: 'maj7', dom7: '7', min7: 'm7',   halfdim: 'm7♭5' },
  { maj7: 'Maj7', dom7: '7', min7: 'min7', halfdim: 'min7♭5' },
  { maj7: '△7',   dom7: '7', min7: '-7',   halfdim: 'ø7' },
  { maj7: 'M7',   dom7: '7', min7: 'm7',   halfdim: 'ø7' },
];

const rand = (n) => Math.floor(Math.random() * n);
const pickRand = (arr) => arr[rand(arr.length)];
const START_LABEL = { 1: 'root', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th' };
const ANCHOR_DEGREE_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

let changesRound = null;

// Which chord tones the line may use: 1-3-5 (triad) or 1-3-5-7 (with the 7th).
function changesToneDegrees() {
  return state.prefs.changesInclude7th === false ? [1, 3, 5] : [1, 3, 5, 7];
}
// The degrees a round's line may START or END (target) on — user-chosen (any 1-7).
function changesAnchors() {
  const a = (state.prefs.changesAnchors || []).filter((d) => ANCHOR_DEGREE_OPTIONS.includes(d));
  return a.length ? a : [1, 3, 5];
}

function chordToneList(chord) {
  return changesToneDegrees().map((d) => noteAtDegree(chord, d));
}

// The note at any scale degree (1-7) of a chord — used for start/target anchors,
// which may be non-chord tones (e.g. the 2nd).
function noteAtDegree(chord, degree) {
  const s = spell(chord.root, chord.quality, degree);
  return { degree, pc: s.pc, letter: s.letter, acc: s.acc, text: s.text, display: s.display };
}

// Nearest chord tone strictly in `direction` (+1 up / -1 down) from prevPitch.
function nearestInDirection(prevPitch, direction, tones) {
  const LOW = 24, HIGH = 96;
  const all = [];
  for (const t of tones) {
    for (let p = LOW; p <= HIGH; p++) {
      if ((((p % 12) + 12) % 12) === t.pc) all.push(Object.assign({}, t, { pitch: p }));
    }
  }
  all.sort((a, b) => a.pitch - b.pitch);
  if (direction > 0) { for (const c of all) if (c.pitch > prevPitch) return c; }
  else { for (let i = all.length - 1; i >= 0; i--) if (all[i].pitch < prevPitch) return all[i]; }
  // Ran out of range in that direction: fall back to the absolute closest.
  return all.reduce((best, c) =>
    Math.abs(c.pitch - prevPitch) < Math.abs(best.pitch - prevPitch) ? c : best, all[0]);
}

function generateChangesLine(chords, startDegree, direction) {
  const start = noteAtDegree(chords[0], startDegree);
  let prevPitch = 60 + start.pc; // seat the start note in a middle octave (60..71)
  const targets = [Object.assign({}, start, { pitch: prevPitch })];
  for (let i = 1; i < chords.length; i++) {
    const tone = nearestInDirection(prevPitch, direction, chordToneList(chords[i]));
    prevPitch = tone.pitch;
    targets.push(tone);
  }
  return targets;
}

// Named progressions, as [scale degree, chord quality] within a major/minor key.
// All are four chords (descending-fourths cycles). Keys are kept stable across
// versions so saved preferences don't break.
const PROGRESSIONS = {
  majoriiVI: { label: 'Major 2-5-1-4', key: 'major', degrees: [[2, 'min7'], [5, 'dom7'], [1, 'maj7'], [4, 'maj7']] },
  minoriiVi: { label: 'Minor 2-5-1-4', key: 'minor', degrees: [[2, 'halfdim'], [5, 'dom7'], [1, 'min7'], [4, 'min7']] },
  major6251: { label: 'Major 6-2-5-1', key: 'major', degrees: [[6, 'min7'], [2, 'min7'], [5, 'dom7'], [1, 'maj7']] },
  minor6251: { label: 'Minor 6-2-5-1', key: 'minor', degrees: [[6, 'maj7'], [2, 'halfdim'], [5, 'dom7'], [1, 'min7']] },
  IviiiV:    { label: '1-6-2-5',       key: 'major', degrees: [[1, 'maj7'], [6, 'min7'], [2, 'min7'], [5, 'dom7']] },
  p3625:     { label: '3-6-2-5',       key: 'major', degrees: [[3, 'min7'], [6, 'min7'], [2, 'min7'], [5, 'dom7']] },
  random:    { label: 'Random' },
};
const PROGRESSION_ORDER = ['majoriiVI', 'minoriiVi', 'major6251', 'minor6251', 'IviiiV', 'p3625', 'random'];

function makeChord(root, quality, scheme) {
  return { root, quality, symbol: root.name + scheme[quality] };
}

// Four chords drawn from the diatonic 7th chords of the checked keys.
function randomChords(scheme) {
  const pool = allowedChords('seventh');
  if (!pool.length) return [];
  const chords = [];
  for (let i = 0; i < 4; i++) {
    let ch;
    do { ch = pickRand(pool); }
    while (pool.length > 1 && i > 0 && ch.root.name === chords[i - 1].root.name && ch.quality === chords[i - 1].quality);
    chords.push(makeChord(ch.root, ch.quality, scheme));
  }
  return chords;
}

// A named progression in a random enabled key of the matching mode (major
// progressions from checked major keys, etc.), spelled for that key.
function progressionChords(type, scheme) {
  const def = PROGRESSIONS[type];
  const keys = enabledKeys().filter(k => k.mode === def.key);
  if (!keys.length) return null;
  const key = pickRand(keys);
  return def.degrees.map(([deg, quality]) => makeChord(cleanRoot(spell(key.tonic, def.key, deg)), quality, scheme));
}

// How the line moves through the chords. Ascending/Descending start on a
// random 3/5/7 and step to the nearest chord tone in that direction. The
// "over/under" modes instead END on a target note (a 3/5/7 of the last chord)
// and approach it: each earlier chord takes its nearest chord tone above (over)
// or below (under) that target, per the named pattern.
const LINE_MODES = {
  ascending:      { label: 'Ascending' },
  descending:     { label: 'Descending' },
  overoverunder:  { label: 'over over under', pattern: [1, 1, -1] },
  underunderover: { label: 'under under over', pattern: [-1, -1, 1] },
};
const LINE_MODE_ORDER = ['ascending', 'descending', 'overoverunder', 'underunderover'];

// End on `targetDegree` of the last chord; approach it per the mode's pattern.
function buildTargetLine(chords, targetDegree, lineMode) {
  const last = chords[chords.length - 1];
  const targetTone = noteAtDegree(last, targetDegree);
  const targetPitch = 60 + targetTone.pc; // seat the target in a middle octave
  const pattern = LINE_MODES[lineMode].pattern;
  const targets = [];
  for (let i = 0; i < chords.length - 1; i++) {
    const dir = i < pattern.length ? pattern[i] : pattern[pattern.length - 1];
    targets.push(nearestInDirection(targetPitch, dir, chordToneList(chords[i])));
  }
  targets.push(Object.assign({}, targetTone, { pitch: targetPitch }));
  return targets;
}

// A progression type can be used only if it has an enabled key of its mode;
// 'random' just needs any enabled key (so any allowed chords exist).
function progressionUsable(t) {
  if (t === 'random') return allowedChords('seventh').length > 0;
  return enabledKeys().some(k => k.mode === PROGRESSIONS[t].key);
}

function buildChangesRound() {
  const knownProg = new Set(PROGRESSION_ORDER);
  const enabledProg = (state.prefs.changesProgressions || []).filter((t) => knownProg.has(t) && progressionUsable(t));
  const type = pickRand(enabledProg.length ? enabledProg : ['random']);
  const scheme = pickRand(NOTATION_SCHEMES);
  let chords = type === 'random' ? randomChords(scheme) : progressionChords(type, scheme);
  if (!chords || !chords.length) chords = randomChords(scheme); // fallback if the chosen type had no key

  const knownModes = new Set(LINE_MODE_ORDER);
  const enabledModes = (state.prefs.changesLineModes || []).filter((m) => knownModes.has(m));
  const lineMode = pickRand(enabledModes.length ? enabledModes : ['ascending', 'descending']);

  const base = { type, chords, lineMode, idx: 0, results: [] }; // `type`/`lineMode` not shown as words beyond the pattern
  if (lineMode === 'ascending' || lineMode === 'descending') {
    const startDegree = pickRand(changesAnchors());
    const direction = lineMode === 'ascending' ? 1 : -1;
    return Object.assign(base, { startDegree, direction, targets: generateChangesLine(chords, startDegree, direction) });
  }
  const targetDegree = pickRand(changesAnchors());
  return Object.assign(base, { targetDegree, targets: buildTargetLine(chords, targetDegree, lineMode) });
}

function newChangesRound() {
  changesRound = buildChangesRound();
}

// The instruction for a round (what to do), without the "Enter a chord tone…" tail.
function changesInstructionText(r) {
  if (r.lineMode === 'overoverunder' || r.lineMode === 'underunderover') {
    const pat = LINE_MODES[r.lineMode].label.replace(/ /g, ' · ');
    return `End on the <strong>${START_LABEL[r.targetDegree]}</strong> of the last chord — approach it <strong>${pat}</strong>`;
  }
  const dir = r.direction > 0 ? 'ascending ↑' : 'descending ↓';
  return `Start on the <strong>${START_LABEL[r.startDegree]}</strong> — <strong>${dir}</strong>`;
}

function renderChangesPrompt() {
  const r = changesRound;
  el.changesInstruction.innerHTML = changesInstructionText(r) + '. Enter a chord tone of each chord.';
  el.changesStrip.innerHTML = '';
  r.chords.forEach((c, i) => {
    const cell = document.createElement('div');
    cell.className = 'changes-cell' + (i === r.idx ? ' current' : '');
    let note;
    if (i < r.idx) {
      const res = r.results[i];
      if (res.correct) {
        note = `<div class="cc-note correct">${r.targets[i].display}</div>`;
      } else {
        // Show what was played (struck) and the correct note, so a miss is clear.
        note = `<div class="cc-note wrong">${r.targets[i].display}</div>` +
               `<div class="cc-typed">you: ${res.typed}</div>`;
      }
    } else {
      note = `<div class="cc-note pending">•</div>`;
    }
    cell.innerHTML = `<div class="cc-chord">${c.symbol}</div>${note}`;
    el.changesStrip.appendChild(cell);
  });
}

function startChangesQuestion() {
  newChangesRound();
  phase = 'awaiting';
  el.singlePrompt.classList.add('hidden');
  el.triadPrompt.classList.add('hidden');
  el.changesPrompt.classList.remove('hidden');
  el.metaRow.classList.add('hidden');
  el.feedback.textContent = '';
  el.input.value = '';
  el.input.className = '';
  el.input.readOnly = false;
  el.submit.textContent = 'Check';
  el.noteKeys.classList.remove('disabled');
  renderChangesPrompt();
  updateKeySelection();
  focusInput();
}

function submitChangesNote() {
  const r = changesRound;
  const parsed = parseAnswer(el.input.value);
  if (!parsed) return;
  if (parsed.invalid) {
    el.feedback.innerHTML = `<div class="verdict bad">Couldn't read that. Try like "Eb", "f#", or "g".</div>`;
    return;
  }
  const target = r.targets[r.idx];
  const exact = parsed.letter === target.letter && parsed.acc === target.acc;
  const correct = exact || (state.prefs.acceptEnharmonic && parsed.pc === target.pc);
  r.results[r.idx] = { correct, typed: parsed.letter + accToText(parsed.acc, true) };
  state.changes.notesAttempted += 1;
  if (correct) state.changes.notesCorrect += 1;
  // Feed the same per-(root, quality, degree) stats the other modes use so the
  // Stats page reflects Changes too (attempts/accuracy only; scheduling untouched).
  const cur = r.chords[r.idx];
  const it = getItem(cur.root.name, cur.quality, target.degree);
  it.attempts += 1;
  if (correct) it.correct += 1;
  r.idx += 1;
  el.input.value = '';
  el.input.className = '';

  if (r.idx < r.chords.length) {
    renderChangesPrompt();
    updateKeySelection();
    focusInput();
    save();
  } else {
    state.changes.rounds += 1;
    finishChangesRound();
    save();
  }
}

function finishChangesRound() {
  const r = changesRound;
  renderChangesPrompt();
  const correctCount = r.results.filter((x) => x.correct).length;
  const line = r.targets
    .map((t, i) => `<span class="verdict ${r.results[i].correct ? 'good' : 'bad'}">${t.display}</span>`)
    .join('  ');
  el.feedback.innerHTML =
    `<div class="verdict ${correctCount === r.chords.length ? 'good' : 'note'}">${correctCount}/${r.chords.length} correct</div>` +
    `<div class="chord-tones">Line:  ${line}</div>` +
    `<div class="next-hint">Press Enter for a new progression</div>`;
  el.input.readOnly = true;
  el.submit.textContent = 'Next ↵';
  el.noteKeys.classList.add('disabled');
  phase = 'feedback';
  focusInput();
  playChangesLine(r);
}

/* =========================================================================
 * AUDIO — offline sampled-piano playback via the Web Audio API. Uses a small
 * bundled subset of the Salamander Grand Piano (same samples song-practice
 * uses, but hosted locally so it works offline), resampled for in-between
 * pitches, through a synthesized reverb. Plays the chord low (left hand) and
 * the asked note an octave higher (right hand). Falls back to a simple
 * oscillator only while samples are still decoding.
 * ========================================================================= */

let audioCtx = null, masterGain = null;
let pianoBuffers = null, pianoLoading = false;
const PIANO_SAMPLES = [
  { file: 'C3', midi: 48 }, { file: 'Fs3', midi: 54 }, { file: 'C4', midi: 60 },
  { file: 'Fs4', midi: 66 }, { file: 'C5', midi: 72 }, { file: 'Fs5', midi: 78 },
  { file: 'C6', midi: 84 },
];

// A synthetic room impulse response (exponentially-decaying noise) — no file.
function makeReverbIR(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    audioCtx = new AC();
    const comp = audioCtx.createDynamicsCompressor(); // tame stacked-note peaks
    comp.connect(audioCtx.destination);
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(comp);                          // dry
    const conv = audioCtx.createConvolver();
    conv.buffer = makeReverbIR(audioCtx, 2.5, 2.2);    // ~ song-practice's reverb feel
    const wet = audioCtx.createGain(); wet.gain.value = 0.18;
    masterGain.connect(conv); conv.connect(wet); wet.connect(comp); // wet
    loadPiano();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume(); // must run inside a user gesture
  return audioCtx;
}

async function loadPiano() {
  if (pianoLoading || pianoBuffers) return;
  pianoLoading = true;
  try {
    pianoBuffers = await Promise.all(PIANO_SAMPLES.map(async (s) => {
      const ab = await (await fetch(`piano/${s.file}.mp3`)).arrayBuffer();
      const buffer = await audioCtx.decodeAudioData(ab);
      return { midi: s.midi, buffer };
    }));
  } catch (e) {
    console.warn('Piano samples failed to load; using fallback tone.', e);
    pianoBuffers = null;
  }
  pianoLoading = false;
}

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Play one note. Uses the nearest piano sample (resampled) once loaded;
// otherwise a soft triangle so the very first note still makes a sound.
function playTone(ctx, midi, start, dur, peak) {
  if (pianoBuffers && pianoBuffers.length) {
    let s = pianoBuffers[0];
    for (const c of pianoBuffers) if (Math.abs(c.midi - midi) < Math.abs(s.midi - midi)) s = c;
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = Math.pow(2, (midi - s.midi) / 12);
    const g = ctx.createGain();
    const level = peak * 2.6; // samples are near full-scale; scale to a safe mix level
    g.gain.setValueAtTime(level, start);
    g.gain.setValueAtTime(level, start + Math.max(0.05, dur - 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.25); // release
    src.connect(g); g.connect(masterGain);
    src.start(start);
    src.stop(start + dur + 0.3);
  } else {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(midi);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g); g.connect(masterGain);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
}

// 1/3/5 for triads, 1/3/5/7 for 7th chords.
const voicingDegrees = (quality) => (QUALITIES[quality].mode === 'triads' ? [1, 3, 5] : [1, 3, 5, 7]);
const chordRootMidi = (root) => 48 + root.pc; // root in the C3..B3 octave (left hand)

function playChordNotes(ctx, root, quality, start, dur) {
  const base = chordRootMidi(root);
  for (const d of voicingDegrees(quality)) playTone(ctx, base + SCALES[quality][d - 1], start, dur, 0.13);
}

// Triads/Chords: one chord + the asked degree an octave above its chord position.
function playChordAndNote(root, quality, degree) {
  if (!state.prefs.sound) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const t = ctx.currentTime + 0.03;
  playChordNotes(ctx, root, quality, t, 2.6);
  const melody = chordRootMidi(root) + SCALES[quality][degree - 1] + 12;
  playTone(ctx, melody, t, 3.0, 0.22);
}

// Triads: the chord low, then a full arpeggio in the round's direction —
// 1 3 5 1(octave up) ascending, or 1 5 3 1(octave down) descending.
function playTriadRound(r) {
  if (!state.prefs.sound) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const t0 = ctx.currentTime + 0.05;
  const base = chordRootMidi(r.chord.root);
  const third = SCALES[r.chord.quality][2], fifth = SCALES[r.chord.quality][4];
  playChordNotes(ctx, r.chord.root, r.chord.quality, t0, 2.6);
  // Offsets relative to `base`; start on the root, walk the triad, end on the root an octave away.
  const arp = r.direction > 0
    ? [12, 12 + third, 12 + fifth, 24]   // ascending: 1 3 5 1↑
    : [12, fifth, third, 0];             // descending: 1 5 3 1↓
  const beat = 0.7;
  arp.forEach((off, i) => {
    playTone(ctx, base + off, t0 + i * beat, beat * 0.9 + 0.6, 0.22);
  });
}

// Changes: the four chords + the four line notes, played as a progression.
function playChangesLine(r) {
  if (!state.prefs.sound) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const beat = 1.24; // half speed — chords held twice as long
  let t = ctx.currentTime + 0.05;
  r.chords.forEach((c, i) => {
    playChordNotes(ctx, c.root, c.quality, t, beat * 0.95);
    playTone(ctx, r.targets[i].pitch + 12, t, beat * 0.95, 0.22); // line note, lifted above chords
    t += beat;
  });
}

/* =========================================================================
 * TRIADS — a random major/minor triad + a direction; enter its 3rd and 5th in
 * order (ascending = 3rd then 5th, descending = 5th then 3rd). Two slots, like
 * a mini Changes round.
 * ========================================================================= */

function triadNote(chord, degree) {
  const s = spell(chord.root, chord.quality, degree);
  return { degree, pc: s.pc, letter: s.letter, acc: s.acc, text: s.text, display: s.display };
}

// The set of triads to drill, taken from the literal roots chosen per quality
// in Settings (major / minor / diminished), rather than any key/scale.
function normalizeTriadRoots() {
  const tr = state.prefs.triadRoots || {};
  const out = {};
  for (const q of TRIAD_QUALITY_ORDER) out[q] = Array.isArray(tr[q]) ? tr[q].slice() : [];
  return out;
}
function triadRootPool() {
  const sel = normalizeTriadRoots();
  const out = [];
  for (const q of TRIAD_QUALITY_ORDER) {
    for (const name of sel[q]) {
      const root = ROOT_BY_NAME[name];
      if (root) out.push({ root, quality: q });
    }
  }
  return out;
}

function buildTriadRound() {
  const pool = triadRootPool();
  const src = pool.length ? pickRand(pool) : { root: ROOT_BY_NAME['C'], quality: 'major' };
  const chord = { root: src.root, quality: src.quality, symbol: chordSymbol(src) };
  const direction = pickRand([1, -1]);
  const third = triadNote(chord, 3), fifth = triadNote(chord, 5);
  const targets = direction > 0 ? [third, fifth] : [fifth, third];
  return { chord, direction, targets, idx: 0, results: [] };
}

function renderTriadPrompt() {
  const r = triadRound;
  const arrow = r.direction > 0 ? '↑' : '↓';
  el.triadSymbol.innerHTML = `${r.chord.symbol} <span class="triad-arrow">${arrow}</span>`;
  const order = r.direction > 0 ? '3rd then 5th' : '5th then 3rd';
  el.triadDirection.innerHTML = `enter the <strong>${order}</strong>`;
  el.triadStrip.innerHTML = '';
  r.targets.forEach((t, i) => {
    const cell = document.createElement('div');
    cell.className = 'changes-cell' + (i === r.idx ? ' current' : '');
    let note;
    if (i < r.idx) {
      const res = r.results[i];
      note = res.correct
        ? `<div class="cc-note correct">${t.display}</div>`
        : `<div class="cc-note wrong">${t.display}</div><div class="cc-typed">you: ${res.typed}</div>`;
    } else {
      note = `<div class="cc-note pending">•</div>`;
    }
    cell.innerHTML = note;
    el.triadStrip.appendChild(cell);
  });
}

function startTriadQuestion() {
  triadRound = buildTriadRound();
  phase = 'awaiting';
  el.singlePrompt.classList.add('hidden');
  el.changesPrompt.classList.add('hidden');
  el.triadPrompt.classList.remove('hidden');
  el.metaRow.classList.add('hidden');
  el.feedback.textContent = '';
  el.input.value = '';
  el.input.className = '';
  el.input.readOnly = false;
  el.submit.textContent = 'Check';
  el.noteKeys.classList.remove('disabled');
  renderTriadPrompt();
  updateKeySelection();
  focusInput();
}

function submitTriadNote() {
  const r = triadRound;
  const parsed = parseAnswer(el.input.value);
  if (!parsed) return;
  if (parsed.invalid) {
    el.feedback.innerHTML = `<div class="verdict bad">Couldn't read that. Try like "Eb", "f#", or "g".</div>`;
    return;
  }
  const target = r.targets[r.idx];
  const exact = parsed.letter === target.letter && parsed.acc === target.acc;
  const correct = exact || (state.prefs.acceptEnharmonic && parsed.pc === target.pc);
  r.results[r.idx] = { correct, typed: parsed.letter + accToText(parsed.acc, true) };
  const it = getItem(r.chord.root.name, r.chord.quality, target.degree);
  it.attempts += 1;
  if (correct) it.correct += 1;
  r.idx += 1;
  el.input.value = '';
  el.input.className = '';
  if (r.idx < r.targets.length) {
    renderTriadPrompt();
    updateKeySelection();
    focusInput();
    save();
  } else {
    finishTriadRound();
    save();
  }
}

function finishTriadRound() {
  const r = triadRound;
  renderTriadPrompt();
  const correctCount = r.results.filter((x) => x.correct).length;
  const line = r.targets
    .map((t, i) => `<span class="verdict ${r.results[i].correct ? 'good' : 'bad'}">${t.display}</span>`)
    .join('  ');
  el.feedback.innerHTML =
    `<div class="verdict ${correctCount === r.targets.length ? 'good' : 'note'}">${correctCount}/${r.targets.length} correct</div>` +
    `<div class="chord-tones">${r.chord.symbol}:  ${line}</div>` +
    `<div class="next-hint">Press Enter for the next chord</div>`;
  el.input.readOnly = true;
  el.submit.textContent = 'Next ↵';
  el.noteKeys.classList.add('disabled');
  phase = 'feedback';
  focusInput();
  playTriadRound(r);
}

function chordName(entry) {
  return `${entry.root.name} ${QUALITIES[entry.quality].label}`;
}

function chordTonesText(entry) {
  const tones = CHORD_TONES[state.prefs.mode]
    .map(d => spell(entry.root, entry.quality, d).display).join('  ');
  return `${entry.symbol} = ${chordName(entry)}:  ${tones}`;
}

function nextQuestion() {
  if (state.prefs.mode === 'songs') {
    el.noteKeys.classList.remove('disabled');
    startSongsView();
    return;
  }
  // Leaving Songs mode: restore the shared answer box and drop the reserved space.
  el.songsPrompt.classList.add('hidden');
  el.form.classList.remove('hidden');
  updateSongsKbdLayout();

  if (state.prefs.mode === 'changes' || state.prefs.mode === 'triads') {
    el.practiceCard.classList.remove('hidden');
    el.emptyPool.classList.add('hidden');
    if (state.prefs.mode === 'changes') startChangesQuestion();
    else startTriadQuestion();
    return;
  }

  current = selectNext();
  phase = 'awaiting';
  el.singlePrompt.classList.remove('hidden');
  el.changesPrompt.classList.add('hidden');
  el.triadPrompt.classList.add('hidden');
  el.metaRow.classList.remove('hidden');
  el.feedback.textContent = '';
  el.input.value = '';
  el.input.className = '';

  if (!current) {
    el.practiceCard.classList.add('hidden');
    el.emptyPool.classList.remove('hidden');
    return;
  }
  el.practiceCard.classList.remove('hidden');
  el.emptyPool.classList.add('hidden');

  current.symbol = chordSymbol(current);
  el.promptQuality.textContent = '';
  el.promptRoot.textContent = current.symbol;
  el.promptAsk.textContent = `What is the ${ordinal(current.degree)}?`;
  el.submit.textContent = 'Check';
  el.input.readOnly = false;
  el.skip.classList.remove('hidden');

  const it = getItem(current.root.name, current.quality, current.degree);
  el.metaLevel.textContent = it.level >= MASTERED_LEVEL ? 'mastered' : `level ${it.level}`;
  el.metaStreak.textContent = `streak ${it.streak}`;
  el.noteKeys.classList.remove('disabled');
  updateKeySelection();
  focusInput();
}

function showFeedback(correct, kind, message, answer) {
  const correctSpelling = spell(current.root, current.quality, current.degree);
  let html = '';
  if (kind === 'correct') {
    html = `<div class="verdict good">✓ Correct — ${correctSpelling.display}</div>`;
  } else if (kind === 'enharmonic') {
    html = `<div class="verdict note">✓ ${answer} works, but spell it ${correctSpelling.display} here</div>`;
  } else {
    html = `<div class="verdict bad">✗ ${message || 'Not quite'} — answer: ${correctSpelling.display}</div>`;
  }
  html += `<div class="chord-tones">${chordTonesText(current)}</div>`;
  html += `<div class="next-hint">Press Enter for the next one</div>`;
  el.feedback.innerHTML = html;
  el.input.className = correct ? 'correct' : 'wrong';
  el.input.readOnly = true;   // read-only (not disabled) keeps focus so Enter still submits
  el.submit.textContent = 'Next ↵';
  el.skip.classList.add('hidden');
  el.noteKeys.classList.add('disabled');
  phase = 'feedback';
  focusInput();               // ensure Enter advances even if the answer was submitted by mouse (desktop)
  playChordAndNote(current.root, current.quality, current.degree);
}

function submitAnswer() {
  if (!current) return;
  const parsed = parseAnswer(el.input.value);
  if (!parsed) return; // empty / unparseable letter — do nothing
  if (parsed.invalid) {
    el.feedback.innerHTML = `<div class="verdict bad">Couldn't read that. Try like "Eb", "f#", or "g".</div>`;
    return;
  }
  const correctSpelling = spell(current.root, current.quality, current.degree);
  const exact = parsed.letter === correctSpelling.letter && parsed.acc === correctSpelling.acc;
  const enharmonic = parsed.pc === correctSpelling.pc;

  if (exact) {
    grade(current, true);
    showFeedback(true, 'correct');
  } else if (enharmonic && state.prefs.acceptEnharmonic) {
    grade(current, true);
    showFeedback(true, 'enharmonic', null, parsed.letter + accToText(parsed.acc, true));
  } else {
    grade(current, false);
    showFeedback(false, 'wrong');
  }
}

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  checkAnswer();
});

el.skip.addEventListener('click', () => {
  if (phase !== 'awaiting' || !current) return;
  grade(current, false);
  showFeedback(false, 'wrong', 'Skipped');
});

// Keep the on-screen key highlight in sync when typing on a real keyboard.
el.input.addEventListener('input', updateKeySelection);

/* ---- Views / navigation ---- */

function setView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'stats') renderStats();
  if (view === 'settings') renderSettings();
  if (view === 'practice') { if (state.prefs.mode === 'songs') focusActiveInput(); else focusInput(); }
  if (view === 'worksheet') { const wm = worksheetMode || state.prefs.mode; $('#ws-mode').value = (wm === 'songs') ? 'triads' : wm; }
}
document.querySelectorAll('.nav-btn').forEach(b =>
  b.addEventListener('click', () => setView(b.dataset.view)));

function setMode(mode) {
  state.prefs.mode = mode;
  save();
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.body.classList.toggle('songs-mode', mode === 'songs');
  renderSettings();
  nextQuestion();
}
document.querySelectorAll('.mode-btn').forEach(b =>
  b.addEventListener('click', () => setMode(b.dataset.mode)));

/* ---- Songs mode controls ---- */
$('#song-folder').addEventListener('click', openSongPicker);
$('#song-shuffle').addEventListener('click', reshuffleSong);
$('#song-picker-close').addEventListener('click', closeSongPicker);
el.songPicker.addEventListener('click', (e) => { if (e.target === el.songPicker) closeSongPicker(); });
el.songSearch.addEventListener('input', () => renderSongList(el.songSearch.value));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.songPicker.classList.contains('hidden')) closeSongPicker();
});

/* ---- Settings ---- */

function renderKeyCheckboxes() {
  const enabled = new Set(state.prefs.keys && state.prefs.keys.length ? state.prefs.keys : ALL_KEY_IDS);
  const render = (box, keys) => {
    box.innerHTML = '';
    for (const k of keys) {
      const on = enabled.has(k.id);
      const label = document.createElement('label');
      label.className = 'deg-check' + (on ? ' on' : '');
      label.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''}><span>${k.label}</span>`;
      label.querySelector('input').addEventListener('change', (e) => toggleKey(k.id, e.target.checked));
      box.appendChild(label);
    }
  };
  render($('#keys-major-checkboxes'), KEYS.filter(k => k.mode === 'major'));
  render($('#keys-minor-checkboxes'), KEYS.filter(k => k.mode === 'minor'));
}

function setKeys(ids) {
  state.prefs.keys = ids.length ? ids : [ALL_KEY_IDS[0]]; // never empty
  save();
  renderSettings();
  nextQuestion();
}
function toggleKey(id, on) {
  let list = (state.prefs.keys && state.prefs.keys.length ? state.prefs.keys : ALL_KEY_IDS).slice();
  if (on) { if (!list.includes(id)) list.push(id); } else { list = list.filter(x => x !== id); }
  setKeys(list);
}

function renderSettings() {
  const mode = state.prefs.mode;
  renderKeyCheckboxes();
  // Triads use their own literal-root selection and Songs use fixed tunes, so
  // the Keys card only applies to Chords and Changes.
  $('#keys-card').classList.toggle('hidden', mode === 'triads' || mode === 'songs');
  $('#degrees-card').classList.toggle('hidden', !(mode === 'chords' || mode === 'songs'));
  $('#changes-card').classList.toggle('hidden', mode !== 'changes');
  $('#triad-card').classList.toggle('hidden', mode !== 'triads');
  $('#accept-enharmonic').checked = state.prefs.acceptEnharmonic;
  $('#sound-toggle').checked = state.prefs.sound;
  if (mode === 'triads') {
    renderTriadRoots();
    return; // triads: no degree checkboxes (always 3 & 5)
  }
  if (mode === 'changes') {
    renderChangesProgressions();
    renderChangesLineModes();
    renderChangesAnchors();
    $('#changes-7th-toggle').checked = state.prefs.changesInclude7th !== false;
    return;
  }
  // chords + songs: the "Degrees to test" card.
  $('#settings-mode-label').textContent = `(${mode})`;
  const selected = currentDegrees();
  const box = $('#degree-checkboxes');
  box.innerHTML = '';
  for (const d of DEGREE_OPTIONS[mode]) {
    const label = document.createElement('label');
    label.className = 'deg-check' + (selected.includes(d) ? ' on' : '');
    label.innerHTML = `<input type="checkbox" ${selected.includes(d) ? 'checked' : ''}><span>${ordinal(d)}</span>`;
    label.querySelector('input').addEventListener('change', (e) => toggleDegree(d, e.target.checked));
    box.appendChild(label);
  }
  $('#accept-enharmonic').checked = state.prefs.acceptEnharmonic;
}

function toggleDegree(d, on) {
  const key = state.prefs.mode === 'triads' ? 'triadDegrees'
    : state.prefs.mode === 'songs' ? 'songDegrees' : 'chordDegrees';
  let list = state.prefs[key].slice();
  if (on) { if (!list.includes(d)) list.push(d); }
  else { list = list.filter(x => x !== d); }
  if (list.length === 0) list = [d]; // never allow zero — re-check the one just unticked
  list.sort((a, b) => a - b);
  state.prefs[key] = list;
  save();
  renderSettings();
  // Songs: re-roll the per-chord degrees for the current song with the new set.
  if (state.prefs.mode === 'songs') { if (songState) loadSong(songState.song); return; }
  nextQuestion();
}

$('#keys-all').addEventListener('click', () => setKeys(ALL_KEY_IDS.slice()));
$('#keys-major-only').addEventListener('click', () => setKeys(KEYS.filter(k => k.mode === 'major').map(k => k.id)));
$('#keys-minor-only').addEventListener('click', () => setKeys(KEYS.filter(k => k.mode === 'minor').map(k => k.id)));

const TRIAD_ROOT_BOX = { major: '#triad-major-checkboxes', minor: '#triad-minor-checkboxes', dim: '#triad-dim-checkboxes' };
function renderTriadRoots() {
  const sel = normalizeTriadRoots();
  for (const q of TRIAD_QUALITY_ORDER) {
    const on = new Set(sel[q]);
    const box = $(TRIAD_ROOT_BOX[q]);
    box.innerHTML = '';
    for (const r of ROOTS) {
      const checked = on.has(r.name);
      const label = document.createElement('label');
      label.className = 'deg-check' + (checked ? ' on' : '');
      label.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}><span>${r.name}</span>`;
      label.querySelector('input').addEventListener('change', (e) => toggleTriadRoot(q, r.name, e.target.checked));
      box.appendChild(label);
    }
  }
}
function setTriadRoots(tr) {
  state.prefs.triadRoots = tr;
  save();
  renderSettings();
  nextQuestion();
}
function toggleTriadRoot(quality, name, on) {
  const tr = normalizeTriadRoots();
  let list = tr[quality];
  if (on) { if (!list.includes(name)) list.push(name); }
  else { list = list.filter(x => x !== name); }
  tr[quality] = list;
  setTriadRoots(tr);
}
$('#triad-all').addEventListener('click', () => setTriadRoots({
  major: TRIAD_ROOT_NAMES.slice(), minor: TRIAD_ROOT_NAMES.slice(), dim: TRIAD_ROOT_NAMES.slice(),
}));
$('#triad-none').addEventListener('click', () => setTriadRoots({ major: [], minor: [], dim: [] }));

function renderChangesProgressions() {
  const enabled = state.prefs.changesProgressions || ['random'];
  const box = $('#changes-prog-checkboxes');
  box.innerHTML = '';
  for (const type of PROGRESSION_ORDER) {
    const on = enabled.includes(type);
    const label = document.createElement('label');
    label.className = 'deg-check' + (on ? ' on' : '');
    label.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''}><span>${PROGRESSIONS[type].label}</span>`;
    label.querySelector('input').addEventListener('change', (e) => toggleChangesProgression(type, e.target.checked));
    box.appendChild(label);
  }
}

function toggleChangesProgression(type, on) {
  let list = (state.prefs.changesProgressions || ['random']).slice();
  if (on) { if (!list.includes(type)) list.push(type); }
  else { list = list.filter(x => x !== type); }
  if (list.length === 0) list = [type]; // never allow zero
  state.prefs.changesProgressions = list;
  save();
  renderSettings();
  if (state.prefs.mode === 'changes') nextQuestion();
}

function renderChangesLineModes() {
  const enabled = state.prefs.changesLineModes || ['ascending', 'descending'];
  const box = $('#changes-linemode-checkboxes');
  box.innerHTML = '';
  for (const m of LINE_MODE_ORDER) {
    const on = enabled.includes(m);
    const label = document.createElement('label');
    label.className = 'deg-check' + (on ? ' on' : '');
    label.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''}><span>${LINE_MODES[m].label}</span>`;
    label.querySelector('input').addEventListener('change', (e) => toggleChangesLineMode(m, e.target.checked));
    box.appendChild(label);
  }
}

function toggleChangesLineMode(m, on) {
  let list = (state.prefs.changesLineModes || ['ascending', 'descending']).slice();
  if (on) { if (!list.includes(m)) list.push(m); }
  else { list = list.filter(x => x !== m); }
  if (list.length === 0) list = [m]; // never allow zero
  state.prefs.changesLineModes = list;
  save();
  renderSettings();
  if (state.prefs.mode === 'changes') nextQuestion();
}

function renderChangesAnchors() {
  const enabled = changesAnchors();
  const box = $('#changes-anchor-checkboxes');
  box.innerHTML = '';
  for (const d of ANCHOR_DEGREE_OPTIONS) {
    const on = enabled.includes(d);
    const label = document.createElement('label');
    label.className = 'deg-check' + (on ? ' on' : '');
    label.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''}><span>${ordinal(d)}</span>`;
    label.querySelector('input').addEventListener('change', (e) => toggleChangesAnchor(d, e.target.checked));
    box.appendChild(label);
  }
}

function toggleChangesAnchor(d, on) {
  let list = changesAnchors().slice();
  if (on) { if (!list.includes(d)) list.push(d); } else { list = list.filter(x => x !== d); }
  if (list.length === 0) list = [d]; // never allow zero
  list.sort((a, b) => a - b);
  state.prefs.changesAnchors = list;
  save();
  renderSettings();
  if (state.prefs.mode === 'changes') nextQuestion();
}

$('#changes-7th-toggle').addEventListener('change', (e) => {
  state.prefs.changesInclude7th = e.target.checked;
  save();
  if (state.prefs.mode === 'changes') nextQuestion();
});

$('#accept-enharmonic').addEventListener('change', (e) => {
  state.prefs.acceptEnharmonic = e.target.checked;
  save();
});

$('#sound-toggle').addEventListener('change', (e) => {
  state.prefs.sound = e.target.checked;
  save();
  // Play a quick preview when turning it on (also unlocks audio on this gesture).
  if (state.prefs.sound && current) playChordAndNote(current.root, current.quality, current.degree);
});

$('#reset-btn').addEventListener('click', () => {
  if (!confirm('Reset all preferences, spaced-repetition progress, and stats? This cannot be undone.')) return;
  state = DEFAULT_STATE();
  save();
  syncModeButtons();
  renderSettings();
  nextQuestion();
});

/* ---- Backup: export / import ---- */

function backupMsg(text, kind) {
  const m = $('#backup-msg');
  m.textContent = text;
  m.className = 'muted backup-msg' + (kind ? ' ' + kind : '');
}

$('#export-btn').addEventListener('click', () => {
  const payload = JSON.stringify({ app: 'chord-practice', version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chord-practice-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backupMsg('Backup downloaded.', 'ok');
});

$('#import-btn').addEventListener('click', () => $('#import-file').click());

$('#import-file').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const incoming = data && data.state ? data.state : data; // accept raw state too
      if (!incoming || typeof incoming !== 'object' || !incoming.items) throw new Error('Not a Chord Practice backup');
      if (!confirm('Replace all current progress and stats with this backup?')) return;
      const base = DEFAULT_STATE();
      state = {
        prefs: Object.assign(base.prefs, incoming.prefs || {}),
        tick: incoming.tick || 0,
        items: incoming.items || {},
        changes: Object.assign(base.changes, incoming.changes || {}),
      };
      save();
      syncModeButtons();
      renderSettings();
      nextQuestion();
      backupMsg('Backup imported.', 'ok');
    } catch (err) {
      backupMsg('Could not import: ' + err.message, 'err');
    } finally {
      e.target.value = ''; // allow re-importing the same file
    }
  };
  reader.readAsText(file);
});

/* ---- Stats ---- */

function pct(correct, attempts) { return attempts ? Math.round((correct / attempts) * 100) : 0; }

function accColor(p, seen) {
  if (!seen) return 'var(--surface-2)';
  // red (0%) -> amber (60%) -> green (100%)
  const hue = Math.round((p / 100) * 130); // 0=red .. 130=green
  return `hsl(${hue} 65% ${matchDark() ? 26 : 88}%)`;
}
function matchDark() { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }

function renderStats() {
  const items = state.items;
  let totAtt = 0, totCorr = 0, mastered = 0, seen = 0;
  for (const k in items) {
    const it = items[k];
    if (it.attempts > 0) { seen++; totAtt += it.attempts; totCorr += it.correct; }
    if (it.level >= MASTERED_LEVEL && it.attempts > 0) mastered++;
  }
  $('#stat-cards').innerHTML = `
    ${statCard(totAtt, 'answers')}
    ${statCard(pct(totCorr, totAtt) + '%', 'accuracy')}
    ${statCard(mastered, 'mastered')}
    ${statCard(seen, 'combos seen')}`;

  renderChangesStats();

  renderBreakdown('#stat-by-degree', 'Degree', it => ordinal(it.degree),
    d => DEGREE_PRIORITY.indexOf(Number(d.replace(/\D/g, ''))));
  renderBreakdown('#stat-by-quality', 'Quality', it => QUALITIES[it.quality].label,
    label => Object.values(QUALITIES).findIndex(q => q.label === label));

  renderHeatmaps();
  $('#heatmap-mode-label').textContent = '(all modes)';
}

function renderChangesStats() {
  const c = state.changes || {};
  const box = $('#stat-changes');
  if (!c.notesAttempted) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="stat-cards">
    ${statCard(c.rounds, 'changes rounds')}
    ${statCard(pct(c.notesCorrect, c.notesAttempted) + '%', 'changes accuracy')}
    ${statCard(c.notesCorrect + '/' + c.notesAttempted, 'changes notes')}</div>`;
}

function statCard(big, lbl) {
  return `<div class="stat-card"><div class="big">${big}</div><div class="lbl">${lbl}</div></div>`;
}

// Aggregate seen items by a key function and render an accuracy table.
function renderBreakdown(sel, colName, keyFn, sortFn) {
  const groups = {};
  for (const k in state.items) {
    const it = state.items[k];
    if (it.attempts === 0) continue;
    const [rootName, quality, degree] = k.split('|');
    const meta = { rootName, quality, degree: Number(degree) };
    const gk = keyFn(meta);
    if (!groups[gk]) groups[gk] = { att: 0, corr: 0 };
    groups[gk].att += it.attempts;
    groups[gk].corr += it.correct;
  }
  const keys = Object.keys(groups).sort((a, b) => (sortFn ? sortFn(a) - sortFn(b) : a.localeCompare(b)));
  if (keys.length === 0) { $(sel).innerHTML = `<p class="muted">No data yet.</p>`; return; }
  let rows = '';
  for (const key of keys) {
    const g = groups[key];
    const p = pct(g.corr, g.att);
    rows += `<tr><td>${key}</td><td>${g.corr}/${g.att}</td>
      <td><div class="bar"><span style="width:${p}%"></span></div></td><td>${p}%</td></tr>`;
  }
  $(sel).innerHTML = `<table class="stat"><thead><tr>
    <th>${colName}</th><th>Correct</th><th>Accuracy</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// All degrees a quality can show, independent of the current Settings selection.
// Triads are tested on 2-5; 7th chords on 2-7 plus the root (1) from Changes.
function heatmapDegrees(q) {
  return QUALITIES[q].mode === 'triads' ? DEGREE_OPTIONS.triads : [1, ...DEGREE_OPTIONS.chords];
}

// One heatmap per quality (all of them), every applicable degree, all roots —
// so the Stats page is a single shared picture across Triads, Chords & Changes.
function renderHeatmaps() {
  const container = $('#stat-heatmaps');
  container.innerHTML = '';
  for (const q of Object.keys(QUALITIES)) {
    const degrees = heatmapDegrees(q);
    // Base roots plus any extra spellings seen from Changes progressions (e.g. C♯).
    const extra = new Set();
    for (const k in state.items) {
      if (state.items[k].attempts === 0) continue;
      const [rn, kq] = k.split('|');
      if (kq === q && !ROOT_BY_NAME[rn]) extra.add(rn);
    }
    const rowNames = [...ROOTS.map(r => r.name), ...[...extra].sort()];
    let head = '<tr><th></th>' + degrees.map(d => `<th>${ordinal(d)}</th>`).join('') + '</tr>';
    let body = '';
    for (const rootName of rowNames) {
      let cells = `<th>${rootName}</th>`;
      for (const d of degrees) {
        const it = state.items[itemKey(rootName, q, d)];
        const seen = it && it.attempts > 0;
        const p = seen ? pct(it.correct, it.attempts) : 0;
        const level = it ? it.level : 0;
        const bw = seen ? Math.min(4, 1 + Math.floor(level / 2)) : 0;
        const title = seen ? `${rootName} ${QUALITIES[q].label} ${ordinal(d)}: ${it.correct}/${it.attempts} (lvl ${level})` : 'not seen';
        cells += `<td class="cell" title="${title}"
          style="background:${accColor(p, seen)};border-width:${bw}px;border-color:var(--accent)">
          ${seen ? it.attempts : ''}</td>`;
      }
      body += `<tr>${cells}</tr>`;
    }
    const div = document.createElement('div');
    div.className = 'heatmap';
    div.innerHTML = `<h3>${QUALITIES[q].label}</h3><table class="hm"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    container.appendChild(div);
  }
}

/* =========================================================================
 * WORKSHEET — opens a print-ready page in a new tab (white US-Letter sheets,
 * black/grey text) built as a self-contained blob document, so it works
 * offline. The document's own script greedily fills each Letter page with
 * questions until it would overflow — letting the browser measure the fit
 * rather than us computing heights by hand.
 * ========================================================================= */

let worksheetMode = null; // null = follow the current practice mode

// Item HTML strings (a `.ws-num` span is filled with the running number when
// an item is placed on a page). One generous pool is generated, then trimmed
// to whatever fills the requested number of pages.
function worksheetItemsHTML(mode, count) {
  const arr = [];
  if (mode === 'changes') {
    for (let i = 0; i < count; i++) {
      const r = buildChangesRound();
      const ans = r.targets.map((t) => t.display).join(' ');
      let h = `<div class="ws-citem" data-ans="${ans}"><div class="ws-cinstr"><span class="ws-num"></span> ${changesInstructionText(r)}</div><div class="ws-cchords">`;
      r.chords.forEach((c) => {
        h += `<div class="ws-cchord"><div class="ws-csym">${c.symbol}</div><div class="ws-cblank"></div></div>`;
      });
      arr.push(h + '</div></div>');
    }
    return arr;
  }
  if (mode === 'triads') {
    const pool = triadRootPool();
    if (!pool.length) return arr;
    let prev = null;
    for (let i = 0; i < count; i++) {
      let ch;
      do { ch = pool[Math.floor(Math.random() * pool.length)]; }
      while (pool.length > 1 && prev && ch.root.name === prev.root.name && ch.quality === prev.quality);
      prev = ch;
      const dir = pickRand([1, -1]);
      const third = spell(ch.root, ch.quality, 3).display;
      const fifth = spell(ch.root, ch.quality, 5).display;
      const ans = dir > 0 ? `${third} ${fifth}` : `${fifth} ${third}`;
      arr.push(`<div class="ws-item" data-ans="${ans}"><div class="ws-q"><span class="ws-num"></span> ${chordSymbol(ch)} ${dir > 0 ? '↑' : '↓'} <span class="ws-blank"></span> <span class="ws-blank"></span></div></div>`);
    }
    return arr;
  }
  const degrees = state.prefs.chordDegrees;
  const combos = [];
  for (const ch of allowedChords('seventh')) for (const d of degrees) combos.push({ root: ch.root, quality: ch.quality, degree: d });
  if (!combos.length) return arr;
  let prev = null;
  for (let i = 0; i < count; i++) {
    let c;
    do { c = combos[Math.floor(Math.random() * combos.length)]; }
    while (combos.length > 1 && prev && c.root === prev.root && c.quality === prev.quality && c.degree === prev.degree);
    prev = c;
    const answer = spell(c.root, c.quality, c.degree).display;
    arr.push(`<div class="ws-item" data-ans="${answer}"><div class="ws-q"><span class="ws-num"></span> ${chordSymbol(c)} — ${ordinal(c.degree)} = <span class="ws-blank"></span></div></div>`);
  }
  return arr;
}

const WORKSHEET_CSS = `
  html, body { margin: 0; background: #9aa2ad; -webkit-print-color-adjust: exact; print-color-adjust: exact;
    font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; }
  .page { width: 8.5in; height: 11in; box-sizing: border-box; padding: 0.6in; margin: 0.3in auto;
    background: #fff; color: #000; box-shadow: 0 3px 14px rgba(0,0,0,.35); overflow: hidden; }
  .ws-title { font-size: 16pt; font-weight: 800; margin: 0 0 2px; }
  .ws-subtitle { font-size: 9pt; color: #666; margin: 0 0 14px; }
  .ws-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9pt 22pt; font-family: ui-monospace, Menlo, Consolas, monospace; }
  .ws-grid.changes { grid-template-columns: 1fr 1fr; gap: 15pt 26pt; }
  .ws-item { font-size: 11pt; line-height: 1.3; break-inside: avoid; }
  .ws-item .ws-q { color: #000; } .ws-num { color: #000; }
  .ws-blank { display: inline-block; min-width: 2.2em; border-bottom: 1px solid #999; }
  .ws-a { color: #666; font-size: 8.5pt; }
  .ws-citem { break-inside: avoid; }
  .ws-cinstr { font-size: 9pt; color: #555; margin-bottom: 4px; }
  .ws-cchords { display: flex; flex-wrap: wrap; gap: 8pt 24pt; font-family: ui-monospace, Menlo, Consolas, monospace; }
  .ws-cchord { text-align: center; }
  .ws-csym { font-weight: 700; font-size: 10.5pt; }
  .ws-cblank { height: 1.25em; border-bottom: 1px solid #999; margin: 3px 0; min-width: 3em; }
  .ws-key-head { margin: 12pt 0 5pt; padding-top: 5pt; border-top: 1px solid #bbb;
    font-family: ui-sans-serif, system-ui, Arial, sans-serif; font-weight: 700; font-size: 8.5pt;
    color: #555; text-transform: uppercase; letter-spacing: .06em; }
  .ws-key-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4pt 18pt;
    font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9.5pt; }
  .ws-key-grid.changes { grid-template-columns: repeat(4, 1fr); }
  .ws-key { color: #333; break-inside: avoid; }
  .ws-key .ws-knum { color: #000; }
  @media print {
    html, body { background: #fff; }
    @page { size: 8.5in 11in; margin: 0; }
    .page { margin: 0; box-shadow: none; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
  }`;

// The pagination script that runs inside the new tab. Each page holds its own
// questions (top) and their answers (bottom): a question and its answer entry are
// added together and the whole page is measured, so both fit and paper isn't
// wasted on a separate key. Numbers are set before measuring (their width matters)
// and run continuously across pages.
const WORKSHEET_FILL_JS = `
  var root = document.getElementById('sheet');
  function el(html) { var t = document.createElement('div'); t.innerHTML = html; return t.firstElementChild; }
  function mkgrid(cls) { var g = document.createElement('div'); g.className = cls; return g; }
  function keyEntry(num, ans) { return '<div class="ws-key"><span class="ws-knum">' + num + '.</span> ' + ans + '</div>'; }

  var idx = 0, pn = 0, n = 0;
  while (idx < ITEMS.length && pn < PAGES) {
    var page = document.createElement('div'); page.className = 'page';
    if (pn === 0) page.innerHTML = '<div class="ws-title">' + TITLE + '</div><div class="ws-subtitle">' + SUBTITLE + '</div>';
    var qgrid = mkgrid(GRID_CLASS);
    var keyHead = el('<div class="ws-key-head">Answers</div>');
    var kgrid = mkgrid(KEY_GRID_CLASS);
    page.appendChild(qgrid); page.appendChild(keyHead); page.appendChild(kgrid);
    root.appendChild(page);

    while (idx < ITEMS.length) {
      var qe = el(ITEMS[idx]);
      qe.querySelector('.ws-num').textContent = (n + 1) + '.';
      qgrid.appendChild(qe);
      var ke = el(keyEntry(n + 1, qe.getAttribute('data-ans')));
      kgrid.appendChild(ke);
      if (page.scrollHeight > page.clientHeight) { qgrid.removeChild(qe); kgrid.removeChild(ke); break; }
      n++; idx++;
    }
    // Trim residual overflow (item heights vary with wrapping).
    while (page.scrollHeight > page.clientHeight && qgrid.children.length > 1) {
      qgrid.removeChild(qgrid.lastElementChild); kgrid.removeChild(kgrid.lastElementChild); n--; idx--;
    }
    // Guarantee progress in the unlikely case nothing fit.
    if (qgrid.children.length === 0 && idx < ITEMS.length) {
      var qe2 = el(ITEMS[idx]); qe2.querySelector('.ws-num').textContent = (n + 1) + '.';
      qgrid.appendChild(qe2); kgrid.appendChild(el(keyEntry(n + 1, qe2.getAttribute('data-ans')))); n++; idx++;
    }
    if (qgrid.children.length === 0) { page.removeChild(keyHead); page.removeChild(kgrid); }
    pn++;
  }`;

function openWorksheetInNewTab() {
  const mode = worksheetMode || state.prefs.mode;
  const pages = Math.max(1, Math.min(4, parseInt($('#ws-pages').value, 10) || 1));
  const modeLabel = { triads: 'Triads', chords: 'Chords', changes: 'Changes' }[mode];
  const perPage = mode === 'changes' ? 44 : 140; // generous upper bound; extras trimmed by the fill
  const items = worksheetItemsHTML(mode, pages * perPage);
  const title = `Chord Practice — ${modeLabel} worksheet`;
  const subtitle = `answers at the foot of each page · ${APP_VERSION}`;
  const config =
    `var PAGES=${pages};var GRID_CLASS=${JSON.stringify(mode === 'changes' ? 'ws-grid changes' : 'ws-grid')};` +
    `var KEY_GRID_CLASS=${JSON.stringify(mode === 'changes' ? 'ws-key-grid changes' : 'ws-key-grid')};` +
    `var TITLE=${JSON.stringify(title)};var SUBTITLE=${JSON.stringify(subtitle)};var ITEMS=${JSON.stringify(items)};`;
  const doc =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
    `<style>${WORKSHEET_CSS}</style></head><body><div id="sheet"></div>` +
    `<script>${config}${WORKSHEET_FILL_JS}<\/script></body></html>`;
  const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

$('#ws-mode').addEventListener('change', (e) => { worksheetMode = e.target.value; });
$('#ws-open').addEventListener('click', openWorksheetInNewTab);

/* ---- Init ---- */

function syncModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === state.prefs.mode));
  document.body.classList.toggle('songs-mode', state.prefs.mode === 'songs');
}

const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = APP_VERSION;

buildNoteKeys();
syncModeButtons();
setView('practice');
nextQuestion();

// Warm up audio + start decoding piano samples on the first user interaction,
// so the very first answer plays the real piano (not the fallback tone).
function primeAudioOnce() {
  if (state.prefs.sound) getAudioCtx();
  window.removeEventListener('pointerdown', primeAudioOnce);
  window.removeEventListener('keydown', primeAudioOnce);
}
window.addEventListener('pointerdown', primeAudioOnce);
window.addEventListener('keydown', primeAudioOnce);

/* ---- Service worker: full offline use + automatic updates ----
 * updateViaCache:'none' means the browser always fetches sw.js from the network
 * (never its own HTTP cache), so a new deploy is noticed on the next open/refocus
 * instead of being stuck behind a stale cached worker. When the new worker takes
 * control we reload once so the fresh assets are used — no manual cache clearing. */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return; // first install: nothing to reload
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update();
        });
      })
      .catch((e) => console.warn('SW registration failed', e));
  });
}
