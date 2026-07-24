# Chord Practice

A spaced-repetition drill for memorizing the notes in triads and 7th chords.
No build step, no dependencies — just static files + `localStorage`.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 4173   # then open http://localhost:4173
```

All preferences, scheduling, and stats are saved in the browser's `localStorage`
(per-browser). Use **Settings → Reset** to wipe everything.

## Use it offline on your phone (installable PWA)

The app is a Progressive Web App: once installed it runs with **no internet
connection**, and your stats stay on the phone in `localStorage`.

Service workers need HTTPS, so it must be loaded from a host once (not `file://`).
The easiest, since this repo is on GitHub:

1. **Publish with GitHub Pages** — push these files, then in the repo go to
   **Settings → Pages → Build and deployment → Deploy from a branch**, pick your
   branch and the `/ (root)` folder, save. After a minute you get a URL like
   `https://<you>.github.io/chord-practice/`. (Any static HTTPS host works too.)
2. **Open that URL on your phone once, with internet.** The service worker caches
   the whole app.
3. **Add to Home Screen:**
   - iPhone (Safari): Share → *Add to Home Screen*.
   - Android (Chrome): menu → *Install app* / *Add to Home Screen*.
4. Launch it from the home-screen icon. It now works fully offline (airplane mode,
   no signal — all fine). Stats accumulate and persist on the device.

**Backups.** Stats live only on that device. Phones can occasionally clear
site storage, and you may want to move devices — so **Settings → Export backup**
saves a `.json` file, and **Import backup** restores it (on any device).

**Updating the app.** The service worker serves a cached copy, so after you change
`index.html`, `styles.css`, or `app.js`, bump `CACHE` in [`sw.js`](sw.js) (e.g.
`chord-practice-v2`). Phones pick up the new version the next time they open it
online.

## How it works

### Modes & qualities
- **Triads** — major, minor
- **Chords** — major 7, dominant 7, minor 7, half-diminished (m7♭5)
- **Changes** — voice-leading through four random 7th chords (see below)

### Changes mode
Each round presents a chord sequence in a **consistent** notation style
(unlike Chords mode, which varies notation per chord — a Changes progression reads
like one chart). You're given a starting chord tone (root/3rd/5th/7th) and a
direction (ascending or descending), both randomized each round. Enter, for each
chord, the chord tone nearest in that direction to your previous note — building a
voice-leading line. e.g. **Dm7 G7 Cmaj7 A7**, start on the 3rd descending →
**F D C A** (each note is the closest 1/3/5/7 of the next chord below the last).
This mirrors the "Chord Tones" exercises in the companion *song-practice* app. Miss
a note and it reveals the correct one and continues; you get a score out of the
number of chords at the end. Each Changes note also feeds the shared
per-(root, quality, degree) stats, so the Stats page reflects Triads, Chords, and
Changes together.

**Sequence types** (Settings → Changes) — choose which to draw from; one is picked
at random each round in a random key, and the type isn't shown during practice. All
are four chords:
- **Major 2-5-1-4** (ii-V-I-IV, e.g. Dm7 G7 Cmaj7 Fmaj7 — the Autumn Leaves A section)
- **Minor 2-5-1-4** (iiø-V-i-iv, e.g. Dm7♭5 G7 Cm7 Fm7)
- **Major 6-2-5-1** (vi-ii-V-I, e.g. Am7 Dm7 G7 Cmaj7 — resolves to the tonic)
- **Minor 6-2-5-1** (♭VImaj7-iiø-V-i, e.g. A♭maj7 Dm7♭5 G7 Cm7)
- **1-6-2-5** (I-vi-ii-V, e.g. Cmaj7 Am7 Dm7 G7)
- **3-6-2-5** (iii-vi-ii-V descending, e.g. Em7 Am7 Dm7 G7)
- **Random** — four random 7th chords (the original behavior)

**Line** (Settings → Changes) — how the melodic line moves; one is chosen at random
each round alongside the sequence:
- **Ascending** / **Descending** — start on a random 3rd/5th/7th and step to the
  nearest chord tone that direction.
- **over over under** / **under under over** — instead *end* on a target note (a
  3rd/5th/7th of the last chord). For each earlier chord you play its nearest chord
  tone above (over) or below (under) the target, per the pattern, then land on the
  target. e.g. Am7 Dm7 G7 Cmaj7 targeting G → over-over-under = A A F G, and
  under-under-over = E F B G.

### Sound
After you answer, the app plays the chord in a low register (left hand) and the
asked note an octave higher (right hand); in Changes it plays the whole four-chord
line as a progression. It uses a **sampled acoustic piano** (a small subset of the
Salamander Grand Piano, resampled for in-between pitches, through a Web Audio
reverb). The samples are **bundled in `piano/` and played via the Web Audio API —
no libraries or network — so it works offline**. Toggle it in Settings.

Piano samples: Salamander Grand Piano V3 by Alexander Holm, licensed CC-BY 3.0
(same set the companion *song-practice* app streams from a CDN; bundled locally
here for offline use). See `piano/CREDITS.txt`.

### Degrees
You pick which scale degree(s) to be quizzed on (Settings). Triads offer 2–5,
Chords offer 2–7. Default is just the **3rd**. The choice is remembered per mode.

The prompt shows a chord symbol and asks for one degree (e.g. *"What is the
3rd?"*). The symbol is drawn in a **randomly-varied notation** each time so you
learn to recognize the many ways chords are written — e.g. major 7 may appear as
`Cmaj7`, `CM7`, `C△7`, or `Cma7`; half-diminished as `Cø7`, `Cm7♭5`, or `C-7♭5`;
minor as `Cm`, `Cmin`, or `C-`. The feedback line reveals what it meant
(`C△7 = C major 7:  C E G B`). Notation variants live in `NOTATIONS` in `app.js`.

**Three ways to answer**, all of which fill the answer box: type on a computer
keyboard, type on the phone's keyboard, or tap the on-screen chromatic keyboard
(A → G♯/A♭). The on-screen black keys are split — sharp spelling on top, flat on
the bottom — so you choose the exact note. On phones the soft keyboard doesn't pop
up automatically (so the on-screen keys stay usable); tap the input box if you'd
rather type.

Type the note — `Eb`, `e flat`, `E♭`, `f#`,
`f sharp`, `g`, `bb` (B-flat), `b` (B-natural), `ax`/`a##` (double sharp) are all
understood.

**Spelling note:** degrees 3/5/7 are the actual chord tones. Degrees 2/4/6 aren't
in the chord, so they're spelled from the chord's parent scale:

| Quality | Parent scale |
|---|---|
| major / major 7 | Ionian (major) |
| minor / minor 7 | Aeolian (natural minor) |
| dominant 7 | Mixolydian |
| half-diminished | Locrian |

Notes are spelled correctly per key — B major's 3rd is **D♯**, not E♭. By default,
an enharmonically-correct answer (typing D♯ where E♭ is expected) is accepted but
nudges you toward the right spelling. Toggle that off in Settings for strict mode.

### Spaced repetition
Every (root, quality, degree) combination is a separately-scheduled item.

- **Easy first.** Roots are ordered by key-signature accidentals: C → G, F → D, B♭
  → … → F♯, G♭. You start on the simplest and work outward.
- **Leitner-style leveling.** Each correct answer raises an item's level and pushes
  its next review further out (1, 2, 3, 5, 8, 13, 21, 34, 55 questions). A miss drops
  the level and brings it back soon — so you see what you know *less*, and weak spots
  *more*.
- **Harder items unlock as you master easy ones.** The pool of introduced items
  grows each time you master something (level ≥ 5), so difficulty ramps up on its own.
  No more than ~8 "still learning" items are in flight at once.

### Stats
The **Stats** tab shows totals, accuracy by degree, accuracy by quality, and a
root × degree heatmap per quality (color = accuracy, number = attempts, border
thickness ≈ mastery level).

## Files
- `index.html` — markup and view structure
- `styles.css` — styling (light/dark via `prefers-color-scheme`)
- `app.js` — music theory, spaced-repetition engine, UI

## Tweaking
Common things to change in `app.js`:
- `ROOTS` — which roots and their difficulty tiers
- `SCALES` — the parent scale used to spell each quality's degrees
- `LEVEL_INTERVAL`, `LEARN_CAP`, `FRONTIER_BASE`, `MASTERED_LEVEL` — pacing of the
  spaced-repetition schedule
