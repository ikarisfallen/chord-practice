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
};

const QUALITIES = {
  major:   { label: 'major',           mode: 'triads', rank: 0 },
  minor:   { label: 'minor',           mode: 'triads', rank: 1 },
  maj7:    { label: 'major 7',         mode: 'chords', rank: 0 },
  dom7:    { label: 'dominant 7',      mode: 'chords', rank: 1 },
  min7:    { label: 'minor 7',         mode: 'chords', rank: 2 },
  halfdim: { label: 'half-diminished', mode: 'chords', rank: 3 },
};
const MODE_QUALITIES = {
  triads: ['major', 'minor'],
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
  maj7:    ['maj7', 'Maj7', 'M7', '△7', 'ma7'],
  dom7:    ['7', 'dom7'],
  min7:    ['m7', 'min7', 'mi7', '-7'],
  halfdim: ['ø7', 'ø', 'm7♭5', 'm7(♭5)', '-7♭5', 'min7♭5'],
};

function chordSymbol(entry) {
  const variants = NOTATIONS[entry.quality];
  return entry.root.name + variants[Math.floor(Math.random() * variants.length)];
}

const DEGREE_OPTIONS = { triads: [2, 3, 4, 5], chords: [2, 3, 4, 5, 6, 7] };
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
 * STATE / PERSISTENCE
 * ========================================================================= */

const STORAGE_KEY = 'chordpractice.v1';

const DEFAULT_STATE = () => ({
  prefs: {
    mode: 'triads',
    triadDegrees: [3],
    chordDegrees: [3],
    acceptEnharmonic: true,
    sound: true,
    changesProgressions: ['random'],
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
  return state.prefs.mode === 'triads' ? state.prefs.triadDegrees : state.prefs.chordDegrees;
}

// All (root, quality, degree) combos allowed by the current mode + selected
// degrees, sorted easiest -> hardest. Index in this list = difficulty rank.
function buildPool() {
  const degrees = currentDegrees();
  const qualities = MODE_QUALITIES[state.prefs.mode];
  const pool = [];
  for (const root of ROOTS) {
    for (const q of qualities) {
      for (const d of degrees) {
        pool.push({
          key: itemKey(root.name, q, d),
          root, quality: q, degree: d,
          sort: [root.tier, QUALITIES[q].rank, DEGREE_PRIORITY.indexOf(d), ROOTS.indexOf(root)],
        });
      }
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
  metaRow: $('.practice-meta'),
};

let current = null;         // current pool entry
let phase = 'awaiting';     // 'awaiting' | 'feedback'

/* ---- On-screen chromatic keyboard (A .. G#/Ab) ---- */

// 12 keys in chromatic order, laid out as two rows of 6. Enharmonic keys are a
// single button; the actual spelling filled is chosen at tap time to match the
// current chord's key signature (see accidentalPreference).
const NOTE_KEYS = [
  { pc: 9,  natural: 'A' },
  { pc: 10, sharp: 'A#', flat: 'Bb' },
  { pc: 11, natural: 'B' },
  { pc: 0,  natural: 'C' },
  { pc: 1,  sharp: 'C#', flat: 'Db' },
  { pc: 2,  natural: 'D' },
  { pc: 3,  sharp: 'D#', flat: 'Eb' },
  { pc: 4,  natural: 'E' },
  { pc: 5,  natural: 'F' },
  { pc: 6,  sharp: 'F#', flat: 'Gb' },
  { pc: 7,  natural: 'G' },
  { pc: 8,  sharp: 'G#', flat: 'Ab' },
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

function noteKeyButton(k) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.pc = k.pc;
  if (k.natural) {
    b.className = 'nkey white';
    b.dataset.note = k.natural;
    b.textContent = k.natural;
  } else {
    b.className = 'nkey blk';
    b.dataset.sharp = k.sharp;
    b.dataset.flat = k.flat;
    b.textContent = toGlyph(k.sharp) + '/' + toGlyph(k.flat);
  }
  return b;
}

// The chord whose key signature governs enharmonic key spelling right now:
// the current single-mode item, or the current chord of a Changes line.
function activeChordForKeys() {
  if (state.prefs.mode === 'changes') {
    return changesRound ? changesRound.chords[changesRound.idx] : null;
  }
  return current;
}

// Resolve which note string a key fills (enharmonic keys pick by key signature).
function keyNote(btn) {
  if (btn.dataset.note) return btn.dataset.note;
  const ctx = activeChordForKeys();
  return ctx && accidentalPreference(ctx) === 'flat' ? btn.dataset.flat : btn.dataset.sharp;
}

function buildNoteKeys() {
  for (let r = 0; r < 2; r++) {
    const row = document.createElement('div');
    row.className = 'nkey-row';
    for (const k of NOTE_KEYS.slice(r * 6, r * 6 + 6)) row.appendChild(noteKeyButton(k));
    el.noteKeys.appendChild(row);
  }

  // Keep input focus on desktop (so Enter still submits) by not letting the
  // button steal it on mousedown; touch just fires click and fills.
  el.noteKeys.addEventListener('mousedown', (e) => {
    if (e.target.closest('.nkey')) e.preventDefault();
  });
  el.noteKeys.addEventListener('click', (e) => {
    const btn = e.target.closest('.nkey');
    if (!btn || phase !== 'awaiting' || !activeChordForKeys()) return;
    el.input.value = keyNote(btn);
    el.input.classList.remove('correct', 'wrong');
    updateKeySelection();
    focusInput();
  });
}

// Highlight the key matching whatever is currently in the input (typed or tapped),
// compared by pitch class so either spelling lights up its enharmonic key.
function updateKeySelection() {
  const parsed = parseAnswer(el.input.value);
  const pc = parsed && !parsed.invalid ? parsed.pc : null;
  el.noteKeys.querySelectorAll('.nkey').forEach(b =>
    b.classList.toggle('sel', pc !== null && Number(b.dataset.pc) === pc));
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
const START_LABEL = { 1: 'root', 3: '3rd', 5: '5th', 7: '7th' };

let changesRound = null;

function chordToneList(chord) {
  return [1, 3, 5, 7].map((d) => {
    const s = spell(chord.root, chord.quality, d);
    return { degree: d, pc: s.pc, letter: s.letter, acc: s.acc, text: s.text, display: s.display };
  });
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
  const firstTones = chordToneList(chords[0]);
  const start = firstTones.find((t) => t.degree === startDegree) || firstTones[0];
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
  IviiiV:    { label: '1-6-2-5',       key: 'major', degrees: [[1, 'maj7'], [6, 'min7'], [2, 'min7'], [5, 'dom7']] },
  p3625:     { label: '3-6-2-5',       key: 'major', degrees: [[3, 'min7'], [6, 'min7'], [2, 'min7'], [5, 'dom7']] },
  random:    { label: 'Random' },
};
const PROGRESSION_ORDER = ['majoriiVI', 'minoriiVi', 'IviiiV', 'p3625', 'random'];
// Minor keys spelled without double accidentals (excludes D♭/G♭ minor).
const MINOR_TONICS = ROOTS.filter(r => r.name !== 'D♭' && r.name !== 'G♭');

function makeChord(root, quality, scheme) {
  return { root, quality, symbol: root.name + scheme[quality] };
}

function randomChords(scheme) {
  const chords = [];
  for (let i = 0; i < 4; i++) {
    let root, quality;
    do {
      root = pickRand(ROOTS);
      quality = pickRand(CHORD_QUALITIES);
    } while (i > 0 && root === chords[i - 1].root && quality === chords[i - 1].quality);
    chords.push(makeChord(root, quality, scheme));
  }
  return chords;
}

// Build a named progression in a random key, spelling each chord's root
// correctly relative to that key (e.g. the ii in B major is C♯m7).
function progressionChords(type, scheme) {
  const def = PROGRESSIONS[type];
  const tonic = pickRand(def.key === 'minor' ? MINOR_TONICS : ROOTS);
  return def.degrees.map(([deg, quality]) => {
    const n = spell(tonic, def.key, deg);
    return makeChord({ name: n.display, letter: n.letter, pc: n.pc }, quality, scheme);
  });
}

function newChangesRound() {
  const known = new Set(PROGRESSION_ORDER);
  const enabled = (state.prefs.changesProgressions || []).filter((t) => known.has(t));
  const type = pickRand(enabled.length ? enabled : ['random']);
  const scheme = pickRand(NOTATION_SCHEMES);
  const chords = type === 'random' ? randomChords(scheme) : progressionChords(type, scheme);
  const startDegree = pickRand([1, 3, 5, 7]);
  const direction = pickRand([1, -1]);
  changesRound = {
    type, chords, startDegree, direction, // `type` is not shown during practice
    targets: generateChangesLine(chords, startDegree, direction),
    idx: 0, results: [],
  };
}

function renderChangesPrompt() {
  const r = changesRound;
  const dir = r.direction > 0 ? 'ascending ↑' : 'descending ↓';
  el.changesInstruction.innerHTML =
    `Start on the <strong>${START_LABEL[r.startDegree]}</strong> — <strong>${dir}</strong>. ` +
    `Enter a chord tone of each chord.`;
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

function chordName(entry) {
  return `${entry.root.name} ${QUALITIES[entry.quality].label}`;
}

function chordTonesText(entry) {
  const tones = CHORD_TONES[state.prefs.mode]
    .map(d => spell(entry.root, entry.quality, d).display).join('  ');
  return `${entry.symbol} = ${chordName(entry)}:  ${tones}`;
}

function nextQuestion() {
  if (state.prefs.mode === 'changes') {
    el.practiceCard.classList.remove('hidden');
    el.emptyPool.classList.add('hidden');
    startChangesQuestion();
    return;
  }

  current = selectNext();
  phase = 'awaiting';
  el.singlePrompt.classList.remove('hidden');
  el.changesPrompt.classList.add('hidden');
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
  if (phase !== 'awaiting') { nextQuestion(); return; }
  if (state.prefs.mode === 'changes') submitChangesNote();
  else submitAnswer();
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
  if (view === 'practice') focusInput();
}
document.querySelectorAll('.nav-btn').forEach(b =>
  b.addEventListener('click', () => setView(b.dataset.view)));

function setMode(mode) {
  state.prefs.mode = mode;
  save();
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  renderSettings();
  nextQuestion();
}
document.querySelectorAll('.mode-btn').forEach(b =>
  b.addEventListener('click', () => setMode(b.dataset.mode)));

/* ---- Settings ---- */

function renderSettings() {
  const mode = state.prefs.mode;
  const isChanges = mode === 'changes';
  $('#degrees-card').classList.toggle('hidden', isChanges);
  $('#changes-card').classList.toggle('hidden', !isChanges);
  $('#accept-enharmonic').checked = state.prefs.acceptEnharmonic;
  $('#sound-toggle').checked = state.prefs.sound;
  if (isChanges) { renderChangesProgressions(); return; }

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
  const key = state.prefs.mode === 'triads' ? 'triadDegrees' : 'chordDegrees';
  let list = state.prefs[key].slice();
  if (on) { if (!list.includes(d)) list.push(d); }
  else { list = list.filter(x => x !== d); }
  if (list.length === 0) list = [d]; // never allow zero — re-check the one just unticked
  list.sort((a, b) => a - b);
  state.prefs[key] = list;
  save();
  renderSettings();
  nextQuestion();
}

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

/* ---- Init ---- */

function syncModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === state.prefs.mode));
}

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

/* ---- Service worker: enables full offline use once installed ---- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}
