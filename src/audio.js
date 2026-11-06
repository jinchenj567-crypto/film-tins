// A camera is half sound. These are made on the spot, only ever in answer to a press.
let context;
let noise;

function audio() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)();
    noise = context.createBuffer(1, context.sampleRate * 0.2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === 'suspended') context.resume();
  return context;
}

function tick(at, length, gain, freq, q = 2) {
  const ac = audio();
  const source = ac.createBufferSource();
  source.buffer = noise;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const level = ac.createGain();
  level.gain.setValueAtTime(gain, at);
  level.gain.exponentialRampToValueAtTime(0.0008, at + length);
  source.connect(filter).connect(level).connect(out());
  source.start(at);
  source.stop(at + length + 0.01);
}

function safely(play) {
  return (...args) => {
    try {
      play(...args);
    } catch {
      /* No audio on this machine. The camera still works. */
    }
  };
}

export const shutterSound = safely(() => {
  const now = audio().currentTime;
  tick(now, 0.022, 0.32, 3400, 1.2);
  tick(now + 0.014, 0.05, 0.26, 1500, 0.9);
  tick(now + 0.03, 0.09, 0.2, 340, 0.8);
});

export const drySound = safely(() => {
  tick(audio().currentTime, 0.03, 0.09, 1900, 1.4);
});

export const windSound = safely((duration = 0.3) => {
  const now = audio().currentTime;
  const ticks = Math.round(duration / 0.024);
  for (let i = 0; i < ticks; i++) tick(now + i * 0.024, 0.016, 0.075 + (i / ticks) * 0.05, 4300 - i * 40, 3.2);
  tick(now + duration, 0.04, 0.14, 2200, 1.4);
});

export const detentSound = safely(() => {
  tick(audio().currentTime, 0.018, 0.1, 3000, 2.4);
});

export const rewindSound = safely((duration = 1.2) => {
  const now = audio().currentTime;
  const ticks = Math.round(duration / 0.05);
  for (let i = 0; i < ticks; i++) tick(now + i * 0.05, 0.035, 0.03, 1100 + (i % 2) * 180, 1.6);
});

/* The rest of the room: paper, film, tin, water, and the room itself. */

let long;
let master;
let muted = false;
try {
  muted = localStorage.getItem('film-tins-quiet') === '1';
} catch {
  muted = false;
}

// Everything except the camera goes through one level, so it can all be switched off together.
function out() {
  const ac = audio();
  if (!master) {
    master = ac.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ac.destination);
    long = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = long.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return master;
}

// A breath of filtered noise: rises over attack, falls away over the rest.
function swell(at, length, gain, freq, { q = 0.8, type = 'bandpass', attack = 0.02 } = {}) {
  const ac = audio();
  const dest = out();
  const source = ac.createBufferSource();
  source.buffer = long;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const level = ac.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + attack);
  level.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(level).connect(dest);
  source.start(at, Math.random() * 1.5);
  source.stop(at + length + 0.02);
}

function crackle(at, length, count, gain, low, high) {
  const ac = audio();
  const dest = out();
  for (let i = 0; i < count; i++) {
    const t = at + Math.random() * length;
    const source = ac.createBufferSource();
    source.buffer = noise;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = low + Math.random() * (high - low);
    filter.Q.value = 1.5;
    const level = ac.createGain();
    const g = gain * (0.4 + Math.random() * 0.6);
    level.gain.setValueAtTime(g, t);
    level.gain.exponentialRampToValueAtTime(0.0005, t + 0.008 + Math.random() * 0.02);
    source.connect(filter).connect(level).connect(dest);
    source.start(t, Math.random() * 0.15);
    source.stop(t + 0.04);
  }
}

// A handled sheet: a soft whoosh with dry crinkles in it.
export const paperSound = safely((weight = 1) => {
  const now = audio().currentTime;
  swell(now, 0.32 * weight, 0.05 * weight, 2600, { q: 0.6, attack: 0.05 });
  crackle(now, 0.28 * weight, Math.round(10 * weight), 0.05, 2200, 6500);
});

// The seal cracks, then the flap peels back off the gum.
export const tearSound = safely(() => {
  const now = audio().currentTime;
  crackle(now + 0.3, 0.05, 4, 0.22, 500, 1800);
  swell(now + 0.36, 0.5, 0.06, 3200, { q: 0.5, attack: 0.08 });
  crackle(now + 0.4, 0.45, 18, 0.045, 2500, 7000);
});

// Two folds opening, one after the other.
export const unfoldSound = safely(() => {
  const now = audio().currentTime;
  [0.45, 0.95].forEach((delay) => {
    swell(now + delay, 0.24, 0.07, 1800, { q: 0.7, attack: 0.03 });
    crackle(now + delay, 0.12, 6, 0.06, 2500, 6000);
  });
});

// A tin lid: a scrape, then the ring of thin steel.
export const lidSound = safely((delay = 0) => {
  const ac = audio();
  const dest = out();
  const now = ac.currentTime + delay;
  swell(now, 0.18, 0.035, 5200, { q: 2, attack: 0.04 });
  [1730, 2690, 4120].forEach((freq, i) => {
    const tone = ac.createOscillator();
    tone.frequency.value = freq;
    const level = ac.createGain();
    level.gain.setValueAtTime(0.0001, now + 0.16);
    level.gain.exponentialRampToValueAtTime(0.03 / (i + 1), now + 0.165);
    level.gain.exponentialRampToValueAtTime(0.0001, now + 0.16 + 0.5 / (i + 1));
    tone.connect(level).connect(dest);
    tone.start(now + 0.16);
    tone.stop(now + 0.8);
  });
});

// Thin plastic sliding over itself.
export const filmSound = safely((length = 0.4) => {
  const now = audio().currentTime;
  swell(now, length, 0.03, 6800, { q: 1.2, attack: length * 0.4 });
  crackle(now, length, 5, 0.025, 4000, 8000);
});

// Water moved by a hand.
export const waterSound = safely((strength = 1) => {
  const now = audio().currentTime;
  swell(now, 0.5, 0.05 * strength, 520, { q: 0.9, type: 'lowpass', attack: 0.12 });
  swell(now + 0.05, 0.3, 0.012 * strength, 2400, { q: 3, attack: 0.05 });
});

// The room: a low, steady hush under everything, so the silence between sounds isn't dead.
let roomStarted = false;
export const startRoom = safely(() => {
  if (roomStarted) return;
  roomStarted = true;
  const ac = audio();
  const source = ac.createBufferSource();
  source.buffer = long || (out(), long);
  source.loop = true;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 380;
  const level = ac.createGain();
  level.gain.setValueAtTime(0.0001, ac.currentTime);
  level.gain.exponentialRampToValueAtTime(0.018, ac.currentTime + 3);
  source.connect(filter).connect(level).connect(out());
  source.start();
});

export const isQuiet = () => muted;

export function setQuiet(value) {
  muted = value;
  try {
    localStorage.setItem('film-tins-quiet', value ? '1' : '0');
  } catch {
    /* Remembered for this visit only. */
  }
  if (master) master.gain.setTargetAtTime(value ? 0 : 1, audio().currentTime, 0.05);
}
