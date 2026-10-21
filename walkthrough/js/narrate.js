// Spoken narration with captions. Uses the browser's own speech voices (Web Speech API).
// If the browser has no voices (or blocks speech), captions still show and the tour advances on a timer.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];
let voiceName = null;
let rate = 1;
let token = 0;            // increments on every stop(), so stale callbacks do nothing
let captionEl = null;
let onStateChange = () => {};

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices().filter(v => /^en/i.test(v.lang));
  onStateChange();
}
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }

let paused = false;
let pauseGen = 0;          // bumps on every pause, so the sentence that was cut short is spoken again
let pauseWaiters = [];
let cutCurrent = null;     // ends the utterance (or reading timer) in progress

export const narrator = {
  get available() { return !!synth && voices.length > 0; },
  get voices() { return voices; },
  get rate() { return rate; },
  set rate(r) { rate = r; },
  get voice() { return voiceName; },
  set voice(n) { voiceName = n; },
  get paused() { return paused; },
  speaking: false,
  attach(el, cb) { captionEl = el; onStateChange = cb || (() => {}); },
  stop() {
    token++;
    this.speaking = false;
    paused = false;
    pauseWaiters.splice(0).forEach(f => f());
    try { synth?.cancel(); } catch { /* ignore */ }
    cutCurrent?.();
    caption('');
    onStateChange();
  },
  // pause mid-sentence; continue repeats that sentence from its start
  pause() {
    if (!this.speaking || paused) return;
    paused = true; pauseGen++;
    try { synth?.cancel(); } catch { /* ignore */ }
    cutCurrent?.();
    if (captionEl && !captionEl.hidden) captionEl.dataset.paused = 'true';
    onStateChange();
  },
  resume() {
    if (!paused) return;
    paused = false;
    if (captionEl) delete captionEl.dataset.paused;
    pauseWaiters.splice(0).forEach(f => f());
    onStateChange();
  },
  toggle() { if (paused) this.resume(); else this.pause(); },
  // speak a text (several sentences); resolves when done or stopped (false if stopped)
  say(text) {
    const my = ++token;
    paused = false; pauseWaiters.splice(0).forEach(f => f());
    if (captionEl) delete captionEl.dataset.paused;
    this.speaking = true; onStateChange();
    const sentences = splitSentences(toSpeech(text));
    try { synth?.cancel(); } catch { /* ignore */ }
    return (async () => {
      let i = 0;
      while (true) {
        if (my !== token) return false;
        if (i >= sentences.length) { this.speaking = false; caption(''); onStateChange(); return true; }
        if (paused) { await new Promise(r => pauseWaiters.push(r)); continue; }
        caption(sentences[i].shown);
        const g = pauseGen;
        await speakOne(sentences[i].spoken, my);
        if (g !== pauseGen) continue;          // cut short by a pause: say it again on continue
        i++;
      }
    })();
  },
};

function caption(t) {
  if (!captionEl) return;
  captionEl.textContent = t;
  captionEl.hidden = !t;
}

// one utterance; falls back to a reading-time timer when speech is unavailable or never starts
function speakOne(text, my) {
  return new Promise(resolve => {
    const words = text.split(/\s+/).length;
    const est = (words / 2.6) / rate * 1000 + 600;
    let done = false;
    const finish = () => { if (!done) { done = true; if (cutCurrent === finish) cutCurrent = null; resolve(); } };
    cutCurrent = finish;
    if (!narrator.available) { setTimeout(finish, est); return; }
    let started = false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      const v = voices.find(x => x.name === voiceName) || voices.find(x => x.default) || voices[0];
      if (v) u.voice = v;
      u.onstart = () => { started = true; };
      u.onend = finish; u.onerror = finish;
      synth.speak(u);
      // some browsers never fire onstart (blocked autoplay); do not hang the tour
      setTimeout(() => { if (!started) finish(); }, 2500);
      setTimeout(finish, est * 2.5 + 3000);
    } catch { setTimeout(finish, est); }
    if (my !== token) finish();
  });
}

// markup → what is shown in captions and what is spoken
function toSpeech(t) {
  const shown = String(t)
    .replace(/\{check\}/g, '(to be confirmed)').replace(/\{v\}/g, '')
    .replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ').trim();
  return shown;
}
function spoken(s) {
  return s
    .replace(/\b\d_\d{4}_/g, '')
    .replace(/bo0?(\d)wh0?(\d)/g, 'bogie $1 wheel $2').replace(/\bbo0?(\d)\b/g, 'bogie $1').replace(/panto0?(\d)/g, 'panto $1')
    .replace(/\.(igs|ia|bin|xml|fbx|mdl|msh|mtl|ani|lua|tga|ace|json|csv|glb)\b/gi, (m, e) => ` dot ${e.length <= 3 ? e.toUpperCase().split('').join(' ') : e}`)
    .replace(/_/g, ' ')
    .replace(/→|─►|›/g, ', then ').replace(/÷/g, ' divided by ').replace(/×/g, ' by ').replace(/±/g, 'plus or minus ')
    .replace(/\bTSC\b/g, 'T S C').replace(/\bTF3\b/g, 'T F 3').replace(/\bTSW\b/g, 'T S W').replace(/\bRV([DMVA])\b/g, 'R V $1')
    .replace(/\bVHIDs?\b/g, m => m.endsWith('s') ? 'V HIDs' : 'V HID').replace(/\bABP\b/g, 'A B P').replace(/\bLOD\b/g, 'L O D')
    .replace(/\bPIE\b/g, 'Play In Editor').replace(/\bBPE2\b/g, 'Blueprint Editor 2').replace(/\bFBX\b/g, 'F B X')
    .replace(/(\d)\s?m\b/g, '$1 metres').replace(/(\d)\s?mm\b/g, '$1 millimetres');
}
function splitSentences(shown) {
  // split only where a sentence really ends: punctuation, a space, then a capital or digit
  const parts = shown.split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/).map(x => x.trim()).filter(Boolean);
  return parts.map(p => ({ shown: p, spoken: spoken(p) }));
}
