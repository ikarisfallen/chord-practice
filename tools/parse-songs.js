// Standalone iRealPro playlist parser.
// Reads song-practice/songs/Songs.html, unscrambles each song, tokenizes the
// chord body, flattens to a linear chord list (expanding Kcl/x inline repeats
// but NOT section repeats), and writes chord-practice/songs.json.
// Parsing logic ported from song-practice/app.js (MIT ireal-reader algorithm).
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
  let cur = null, pendingLeft = null, pendingSection = null, pendingEnding = null,
      pendingMarkers = [], lastChord = null;
  function startBar() {
    if (cur) bars.push(cur);
    cur = { chords: [], leftBar: pendingLeft || 'single', rightBar: 'single',
            section: pendingSection, ending: pendingEnding, markers: pendingMarkers, repeatPrev: 0 };
    pendingLeft = null; pendingSection = null; pendingEnding = null; pendingMarkers = [];
  }
  function endBar(type) {
    if (cur) { cur.rightBar = type; bars.push(cur); cur = null; }
    else if (bars.length > 0 && type !== 'single' && bars[bars.length - 1].rightBar === 'single') {
      bars[bars.length - 1].rightBar = type;
    }
  }
  for (const t of tokens) {
    switch (t.type) {
      case 'repeatStart': endBar('single'); pendingLeft = 'repeatStart'; break;
      case 'repeatEnd': endBar('repeatEnd'); break;
      case 'doubleStart': endBar('single'); pendingLeft = 'double'; break;
      case 'doubleEnd': endBar('double'); break;
      case 'bar': endBar('single'); break;
      case 'finalBar': endBar('final'); break;
      case 'section': if (!cur) pendingSection = t.m[1]; else cur.section = t.m[1]; break;
      case 'ending': if (!cur) pendingEnding = t.m[1]; else cur.ending = t.m[1]; break;
      case 'segno': case 'coda': case 'endMarker': case 'comment': {
        const marker = t.type === 'comment' ? { type: 'comment', text: t.m[1] } : { type: t.type };
        if (cur) cur.markers.push(marker);
        else if (bars.length > 0) bars[bars.length - 1].markers.push(marker);
        else { startBar(); cur.markers.push(marker); }
        break;
      }
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

// Unroll {…} section repeats, handling N1/N2 first/second endings. A plain
// repeat (no endings) is simply played twice. Ported from song-practice.
function expandIRealRepeats(bars) {
  const out = [];
  let i = 0;
  const strip = (src) => {
    const b = { ...src, markers: src.markers ? [...src.markers] : [] };
    if (b.leftBar === 'repeatStart') b.leftBar = 'single';
    if (b.rightBar === 'repeatEnd') b.rightBar = 'single';
    return b;
  };
  const endingMatches = (b, n) => b && (b.ending == n);
  while (i < bars.length) {
    if (bars[i].leftBar === 'repeatStart') {
      let j = i;
      while (j < bars.length && bars[j].rightBar !== 'repeatEnd') j++;
      if (j < bars.length) {
        let n1Start = -1;
        for (let k = i; k <= j; k++) if (endingMatches(bars[k], 1)) { n1Start = k; break; }
        let n2Start = -1, n2End = -1;
        for (let k = j + 1; k < bars.length; k++) {
          if (endingMatches(bars[k], 2)) {
            n2Start = k;
            const n1Length = n1Start >= 0 ? (j - n1Start + 1) : 0;
            if (n1Length > 0) n2End = Math.min(n2Start + n1Length - 1, bars.length - 1);
            else {
              n2End = n2Start;
              while (n2End + 1 < bars.length && !bars[n2End + 1].section && !bars[n2End + 1].ending
                     && bars[n2End + 1].leftBar !== 'repeatStart'
                     && bars[n2End].rightBar !== 'final' && bars[n2End].rightBar !== 'double') n2End++;
            }
            break;
          }
        }
        for (let k = i; k <= j; k++) { const b = strip(bars[k]); if (n1Start >= 0 && k >= n1Start) b.ending = '1'; out.push(b); }
        const commonEnd = n1Start >= 0 ? n1Start - 1 : j;
        for (let k = i; k <= commonEnd; k++) out.push(strip(bars[k]));
        if (n2Start >= 0) {
          for (let k = n2Start; k <= n2End; k++) { const b = strip(bars[k]); b.ending = '2'; out.push(b); }
          i = n2End + 1;
        } else i = j + 1;
        continue;
      }
    }
    out.push(bars[i]); i++;
  }
  return out;
}

// "D.C. al Fine" → append section A (bar 0..Fine) again. Ported from song-practice.
function expandDCAlFine(bars) {
  const FINE_RE = /^\s*fine\s*\.?\s*$/i;
  let fineIdx = -1, hasDCAlFine = false;
  bars.forEach((b, i) => (b.markers || []).forEach(m => {
    if (m.type !== 'comment') return;
    const text = (m.text || '').trim();
    if (FINE_RE.test(text)) fineIdx = i;
    const lc = text.toLowerCase();
    if (lc.includes('d.c. al fine') || lc.includes('dc al fine')) hasDCAlFine = true;
  }));
  if (!hasDCAlFine || fineIdx < 0) return bars;
  const out = bars.slice();
  for (let j = 0; j <= fineIdx; j++) out.push(bars[j]);
  return out;
}

// Linearise simple repeats + D.C./D.S. al Coda into the played order.
function expandForPlayback(bars) {
  let coda = -1, segno = -1;
  bars.forEach((b, i) => {
    if ((b.markers || []).some(m => m.type === 'coda')) coda = i;
    if ((b.markers || []).some(m => m.type === 'segno')) segno = i;
  });
  const out = [];
  let dcAlCoda = false, dsAlCoda = false;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    (b.markers || []).forEach(m => {
      if (m.type !== 'comment') return;
      const t = (m.text || '').toLowerCase();
      if (t.includes('d.c. al coda') || t.includes('dc al coda')) dcAlCoda = true;
      if (t.includes('d.s. al coda') || t.includes('ds al coda')) dsAlCoda = true;
    });
    out.push(b);
    if (b.rightBar === 'repeatEnd') {
      const startBar = bars.findIndex((x, idx) => idx <= i && x.leftBar === 'repeatStart');
      const s = startBar < 0 ? 0 : startBar;
      for (let j = s; j <= i; j++) out.push(bars[j]);
    }
    if (dcAlCoda && coda >= 0) {
      for (let j = 0; j < coda; j++) out.push(bars[j]);
      for (let j = coda; j < bars.length; j++) out.push(bars[j]);
      return out;
    }
    if (dsAlCoda && segno >= 0 && coda >= 0) {
      for (let j = segno; j < coda; j++) out.push(bars[j]);
      for (let j = coda; j < bars.length; j++) out.push(bars[j]);
      return out;
    }
  }
  return out;
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
    let b = buildBars(tokenize(s.body));
    b = expandIRealRepeats(b);  // {…} repeats + N1/N2 endings
    b = expandDCAlFine(b);      // D.C. al Fine
    b = expandForPlayback(b);   // any remaining simple repeats + D.C./D.S. al Coda
    const bars = flattenBars(b);
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
