// Standalone iRealPro playlist parser.
// Reads an iRealPro Songs.html export, unscrambles each song, tokenizes the chord
// body, and groups chords into measures (expanding Kcl/x inline repeats but NOT
// section repeats), then writes songs.json.
// Parsing logic ported from song-practice/app.js (MIT ireal-reader algorithm).
//
// Usage:
//   node tools/parse-songs.js <path-to-Songs.html> <output songs.json>
// e.g.
//   node tools/parse-songs.js ../song-practice/songs/Songs.html songs.json
'use strict';
const fs = require('fs');
const path = require('path');

const IN = process.argv[2];
const OUT = process.argv[3];

// ---- unscramble ----
function obfusc50(s) {
  const a = s.split('');
  for (let i = 0; i < 5; i++) { a[49 - i] = s[i]; a[i] = s[49 - i]; }
  for (let i = 10; i < 24; i++) { a[49 - i] = s[i]; a[i] = s[49 - i]; }
  return a.join('');
}
function unscrambleIReal(s) {
  let r = '', p;
  while (s.length > 50) {
    p = s.substring(0, 50);
    s = s.substring(50);
    if (s.length < 2) r += p; else r += obfusc50(p);
  }
  return r + s;
}

function extractAllIrealURLs(text) {
  const urls = [];
  const re = /irealb:\/\/[^"'<>\s]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[0].replace(/^irealb:\/\//, '');
    for (const part of body.split('===')) {
      if (part.trim().length) urls.push('irealb://' + part);
    }
  }
  return urls;
}

function parseIRealSong(url) {
  const decoded = decodeURIComponent(url.replace(/^irealb:\/\//, ''));
  const parts = decoded.split('=');
  const title = parts[0];
  const composer = parts[1];
  const style = parts[3];
  const key = parts[4];
  const bodyRaw = parts[6] || '';
  let body = bodyRaw;
  if (body.startsWith('1r34LbKcu7')) body = body.substring(10);
  body = unscrambleIReal(body);
  return { title, composer, style, key, body };
}

function tokenize(body) {
  body = body.replace(/\([^()]*\)/g, '');
  const tokens = [];
  const rules = [
    [/^\{/, 'repeatStart'],
    [/^\}/, 'repeatEnd'],
    [/^\[/, 'doubleStart'],
    [/^\]/, 'doubleEnd'],
    [/^\|/, 'bar'],
    [/^LZ/, 'bar'],
    [/^Z/, 'finalBar'],
    [/^\*([A-Za-z])/, 'section'],
    [/^T(\d\d)/, 'timesig'],
    [/^N(\d)/, 'ending'],
    [/^S/, 'segno'],
    [/^Q/, 'coda'],
    [/^U/, 'endMarker'],
    [/^<(.*?)>/, 'comment'],
    [/^XyQ/, 'space'],
    [/^Kcl/, 'kcl'],
    [/^x/, 'xrepeat'],
    [/^r/, 'rrepeat'],
    [/^Y+/, 'spacer'],
    [/^n/, 'nc'],
    [/^p/, 'pause'],
    [/^,/, 'comma'],
    [/^([A-GW])((?:[#b])?(?:\^|\-|h|o|\+|sus)*(?:\d+(?:sus)?)?(?:(?:[#b])\d+)*(?:sus\d?)?)(\/([A-G][#b]?))?/, 'chord'],
  ];
  let s = body;
  let guard = 0;
  while (s.length && guard++ < 20000) {
    let matched = false;
    for (const [re, type] of rules) {
      const m = s.match(re);
      if (m) { tokens.push({ type, text: m[0], m }); s = s.substring(m[0].length); matched = true; break; }
    }
    if (!matched) s = s.substring(1);
  }
  return tokens;
}

function buildBars(tokens) {
  const bars = [];
  let cur = null, pendingLeft = null, lastChord = null;
  function startBar() {
    if (cur) bars.push(cur);
    cur = { chords: [], leftBar: pendingLeft || 'single', rightBar: 'single', repeatPrev: 0 };
    pendingLeft = null;
  }
  function endBar(type) {
    if (cur) { cur.rightBar = type; bars.push(cur); cur = null; }
  }
  for (const t of tokens) {
    switch (t.type) {
      case 'repeatStart': endBar('single'); pendingLeft = 'repeatStart'; break;
      case 'repeatEnd': endBar('repeatEnd'); break;
      case 'doubleStart': endBar('single'); pendingLeft = 'double'; break;
      case 'doubleEnd': endBar('double'); break;
      case 'bar': endBar('single'); break;
      case 'finalBar': endBar('final'); break;
      case 'nc': if (!cur) startBar(); cur.chords.push({ nc: true }); break;
      case 'pause': if (!cur) startBar(); cur.chords.push({ slash: true }); break;
      case 'xrepeat': if (!cur) startBar(); cur.repeatPrev = 1; break;
      case 'kcl': endBar('single'); startBar(); cur.repeatPrev = 1; endBar('single'); break;
      case 'rrepeat':
        endBar('single');
        startBar(); cur.repeatPrev = 2; endBar('single');
        startBar(); cur.repeatPrev = 2; endBar('single');
        break;
      case 'chord': {
        if (!cur) startBar();
        let root = t.m[1], rest = t.m[2] || '', bass = t.m[4] || null;
        if (root === 'W' && lastChord) { root = lastChord.root; rest = lastChord.rest; }
        else lastChord = { root, rest };
        cur.chords.push({ root, rest, bass });
        break;
      }
      default: break;
    }
  }
  if (cur) bars.push(cur);
  return bars;
}

// iReal rest -> readable display symbol
function displayRest(rest) {
  return rest
    .replace(/\^/g, '△')   // ^ -> triangle (major 7)
    .replace(/-/g, 'm')
    .replace(/h/g, 'ø')    // h -> half-dim
    .replace(/o/g, '°')    // o -> dim
    .replace(/b/g, '♭')    // b -> flat
    .replace(/#/g, '♯');   // # -> sharp
}
function fancyRoot(r) {
  return r.replace(/b/g, '♭').replace(/#/g, '♯');
}

// Flatten bars -> array of measures, each measure an array of {t,d} chords.
// Expand Kcl/x/r (repeat previous bar) inline; keep measure grouping.
function flattenBars(bars) {
  const out = [];
  let prevBarChords = [];
  for (const bar of bars) {
    let barChords;
    if (bar.repeatPrev) {
      barChords = prevBarChords;
    } else {
      barChords = bar.chords.filter(c => c.root); // drop nc/slash
      if (barChords.length) prevBarChords = barChords;
    }
    if (!barChords.length) continue; // skip empty measures
    out.push(barChords.map(c => ({
      t: c.root + (c.rest || ''),
      d: fancyRoot(c.root) + displayRest(c.rest || '') + (c.bass ? '/' + fancyRoot(c.bass) : ''),
    })));
  }
  return out;
}

// ---- main ----
const html = fs.readFileSync(IN, 'utf8');
const urls = extractAllIrealURLs(html);
const songs = [];
for (const url of urls) {
  try {
    const s = parseIRealSong(url);
    const rawBars = buildBars(tokenize(s.body));
    const bars = flattenBars(rawBars);
    if (!bars.length) continue;
    songs.push({
      title: s.title.trim(),
      composer: (s.composer || '').trim(),
      key: (s.key || '').trim(),
      bars,
    });
  } catch (e) {
    console.error('Failed to parse a song:', e.message);
  }
}
songs.sort((a, b) => a.title.localeCompare(b.title));
fs.writeFileSync(OUT, JSON.stringify(songs));
console.log(`Parsed ${songs.length} songs -> ${OUT}`);
console.log('Sample (first song):', JSON.stringify(songs[0], null, 0).slice(0, 400));
const counts = songs.map(s => s.bars.length);
console.log('Bar counts: min', Math.min(...counts), 'max', Math.max(...counts), 'avg', Math.round(counts.reduce((a,b)=>a+b,0)/counts.length));
const maxChordsPerBar = Math.max(...songs.flatMap(s => s.bars.map(b => b.length)));
console.log('Max chords in one bar:', maxChordsPerBar);
console.log('Total size (KB):', Math.round(fs.statSync(OUT).size / 1024));
