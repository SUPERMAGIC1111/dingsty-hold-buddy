// node --test analyzer.test.js  : synthetic signals only (no real calls), checks the heuristic separates them
const test = require('node:test'), assert = require('node:assert');
const A = require('./analyzer.js');
const N = Math.round(A.FPS * 2.4);

function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// "hold music": steady level, slow beat at 2 Hz (120 bpm) with small swing
function music(seed) { const r = rnd(seed); const e = []; for (let i = 0; i < N; i++) { const t = i / A.FPS; e.push(0.08 * (1 + 0.18 * Math.sin(2 * Math.PI * 2 * t)) + 0.004 * r()); } return e; }
// "speech": syllables at ~4.5 Hz with word pauses (level swings between near zero and loud)
// irregular syllable onsets (random 160-290 ms apart) and random word pauses, like real speech
function speech(seed) { const r = rnd(seed); const e = new Array(N).fill(0.002); let t = 0.05, word = 0; while (t < 2.4) { const dur = 0.09 + 0.07 * r(); const amp = 0.04 + 0.06 * r(); for (let i = Math.round(t * A.FPS); i < Math.round((t + dur) * A.FPS) && i < N; i++) e[i] += amp * Math.sin(Math.PI * (i / A.FPS - t) / dur); t += 0.16 + 0.13 * r(); if (++word % 4 === 0) t += 0.15 + 0.35 * r(); } return e; }
const silence = () => Array.from({ length: N }, () => 0.0008);

test('silence is silence', () => assert.equal(A.classify(silence()).label, 'silence'));
test('steady hold music is music', () => { for (let s = 1; s <= 5; s++) assert.equal(A.classify(music(s)).label, 'music'); });
test('speech-like rhythm is speech', () => { for (let s = 1; s <= 5; s++) assert.equal(A.classify(speech(s)).label, 'speech', 'seed ' + s + ' ' + JSON.stringify(A.classify(speech(s)))); });

test('watcher alerts only after hold then enough speech', () => {
  const w = A.createWatcher({ minHoldMs: 6000, minSpeechMs: 3000 }); let t = 0;
  for (let i = 0; i < 20; i++) w.push('music', (t += 500));
  assert.equal(w.get().state, 'hold');
  w.push('speech', (t += 500)); w.push('speech', (t += 500)); assert.equal(w.get().state, 'hold');
  for (let i = 0; i < 5; i++) w.push('speech', (t += 500)); assert.equal(w.get().state, 'alert');
});
test('speech without hold music before it does not alert', () => {
  const w = A.createWatcher(); let t = 0;
  for (let i = 0; i < 20; i++) w.push('speech', (t += 500)); assert.notEqual(w.get().state, 'alert');
});
test('short announcement during hold does not alert, long speech does', () => {
  const w = A.createWatcher({ minHoldMs: 6000, minSpeechMs: 3000 }); let t = 0;
  for (let i = 0; i < 20; i++) w.push('music', (t += 500));
  w.push('speech', (t += 500)); w.push('speech', (t += 500)); w.push('music', (t += 500));
  assert.equal(w.get().state, 'hold');
});
