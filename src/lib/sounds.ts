/** Tiny synthesized sounds (no audio assets needed). */
let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());

function tone(freq: number, start: number, length: number, gain = 0.08) {
  const c = audio();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.linearRampToValueAtTime(0, c.currentTime + start + length);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + length + 0.05);
}

export function playMessageSound() {
  try {
    tone(880, 0, 0.12);
    tone(1320, 0.1, 0.14);
  } catch {
    /* autoplay blocked */
  }
}

let ringTimer: ReturnType<typeof setInterval> | null = null;

/** kind: "incoming" rings, "outgoing" plays a ringback tone. */
export function startRinging(kind: 'incoming' | 'outgoing') {
  stopRinging();
  const play = () => {
    try {
      if (kind === 'incoming') {
        tone(660, 0, 0.35, 0.12);
        tone(880, 0.4, 0.35, 0.12);
      } else {
        tone(440, 0, 1.0, 0.05);
        tone(480, 0, 1.0, 0.05);
      }
    } catch {
      /* ignore */
    }
  };
  play();
  ringTimer = setInterval(play, kind === 'incoming' ? 2000 : 3000);
}

export function stopRinging() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
}

/** Must be called from a user gesture once so later sounds are allowed. */
export function unlockAudio() {
  try {
    void audio().resume();
  } catch {
    /* ignore */
  }
}
