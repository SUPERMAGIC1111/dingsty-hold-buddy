/* Dingsty Hold Buddy: tiny audio analyser. Pure functions, no network, nothing stored.
   Input: amplitude envelope, one RMS value per FRAME_MS. Output: 'silence' | 'music' | 'speech' | 'unsure'.
   Heuristic only (demo). Speech has a strong 3-7 Hz syllable rhythm and a large level swing; hold music is steadier. */
(function (root) {
  var FRAME_MS = 25, FPS = 1000 / FRAME_MS;

  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function std(a, m) { var s = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - m; s += d * d; } return Math.sqrt(s / (a.length || 1)); }
  function goertzel(x, freq) { // power of x at freq (Hz), x sampled at FPS
    var w = 2 * Math.PI * freq / FPS, c = 2 * Math.cos(w), s0 = 0, s1 = 0, s2 = 0;
    for (var i = 0; i < x.length; i++) { s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
    return s1 * s1 + s2 * s2 - c * s1 * s2;
  }
  function classify(env, opts) {
    opts = opts || {};
    var silenceRms = opts.silenceRms || 0.004;
    if (!env || env.length < FPS) return { label: 'unsure', cv: 0, syl: 0, level: 0 };
    var m = mean(env);
    if (m < silenceRms) return { label: 'silence', cv: 0, syl: 0, level: m };
    var cv = std(env, m) / m;
    var x = env.map(function (v) { return v - m; });
    var syl = 0, tot = 0, f;
    for (f = 0.5; f <= 12; f += 0.5) { var p = goertzel(x, f); tot += p; if (f >= 3 && f <= 7) syl += p; }
    var ratio = tot > 0 ? syl / tot : 0;
    var label = 'unsure';
    if (cv > 0.55 && ratio > 0.3) label = 'speech';
    else if (cv < 0.45 || ratio < 0.18) label = 'music';
    return { label: label, cv: cv, syl: ratio, level: m };
  }

  /* State machine. Call push(label, nowMs) every evaluation (about every 500 ms).
     states: listening -> hold (after enough music) -> alert (speech for minSpeechMs after hold) */
  function createWatcher(cfg) {
    cfg = cfg || {};
    var minHoldMs = cfg.minHoldMs || 6000, minSpeechMs = cfg.minSpeechMs || 3000;
    var s = { state: 'listening', musicMs: 0, speechMs: 0, last: null, prev: null };
    return {
      get: function () { return s; },
      setSpeechMs: function (v) { minSpeechMs = v; },
      setHoldMs: function (v) { minHoldMs = v; },
      holdMs: function () { return minHoldMs; },
      reset: function () { s.state = 'listening'; s.musicMs = 0; s.speechMs = 0; s.last = null; s.prev = null; },
      backToHold: function () { s.state = 'hold'; s.speechMs = 0; },
      push: function (label, now) {
        var dt = s.last == null ? 0 : now - s.last; s.last = now; if (dt > 2000) dt = 500;
        if (s.state === 'alert') return s;
        if (label === 'music') { s.musicMs += dt; s.speechMs = 0; if (s.musicMs >= minHoldMs) s.state = 'hold'; }
        else if (label === 'speech') { if (s.state === 'hold') { s.speechMs += dt; if (s.speechMs >= minSpeechMs) s.state = 'alert'; } }
        else if (label === 'silence') { s.speechMs = 0; }
        else if (label === 'unsure' && s.state === 'hold' && s.prev === 'speech') { s.speechMs += dt / 2; if (s.speechMs >= minSpeechMs) s.state = 'alert'; }
        s.prev = label;
        return s;
      }
    };
  }

  var api = { FRAME_MS: FRAME_MS, FPS: FPS, classify: classify, createWatcher: createWatcher };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DingstyAnalyzer = api;
})(typeof self !== 'undefined' ? self : this);
