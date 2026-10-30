import { defineSound, ensureReady, setMasterVolume, type SoundDefinition } from '@web-kits/audio';

// The studio's sounds, synthesized in the browser (@web-kits/audio): no file, no network. Short and
// quiet, one per kind of moment, so each is recognised without looking.
export type Cue = 'arrive' | 'done' | 'comment' | 'failed' | 'success' | 'sent' | 'error' | 'tap';

const tone = (frequency: number, at = 0, decay = 0.18, gain = 0.22, type: 'sine' | 'triangle' = 'sine') => ({
  source: { type, frequency },
  envelope: { attack: 0.004, decay, sustain: 0, release: 0.05 },
  gain,
  delay: at,
});

const DEFINITIONS: Record<Cue, SoundDefinition> = {
  // A new MR in the list: two soft rising notes.
  arrive: { layers: [tone(660, 0, 0.14, 0.16), tone(880, 0.08, 0.2, 0.14)] },
  // A review or a triage is ready: a major arpeggio.
  done: { layers: [tone(523.25, 0, 0.22, 0.16), tone(659.25, 0.07, 0.22, 0.14), tone(783.99, 0.14, 0.3, 0.13)] },
  // A reviewer wrote on my MR: a light double knock.
  comment: { layers: [tone(988, 0, 0.07, 0.14, 'triangle'), tone(988, 0.11, 0.09, 0.12, 'triangle')] },
  // A run failed: two falling notes, low.
  failed: { layers: [tone(392, 0, 0.18, 0.18, 'triangle'), tone(311.13, 0.12, 0.28, 0.16, 'triangle')] },
  // An action of mine went through.
  success: { layers: [tone(784, 0, 0.09, 0.13), tone(1046.5, 0.05, 0.14, 0.11)] },
  // A review or the replies sent to GitLab: a quick upward sweep.
  sent: { source: { type: 'sine', frequency: { start: 520, end: 1240 } }, envelope: { attack: 0.005, decay: 0.16, sustain: 0, release: 0.05 }, gain: 0.16 },
  // An action of mine failed.
  error: { source: { type: 'triangle', frequency: { start: 300, end: 220 } }, envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.05 }, gain: 0.18 },
  // A small confirmation (a fold, a switch).
  tap: { source: { type: 'noise', color: 'white' }, filter: { type: 'bandpass', frequency: 2400 }, envelope: { decay: 0.025 }, gain: 0.08 },
};

const players = Object.fromEntries(Object.entries(DEFINITIONS).map(([k, d]) => [k, defineSound(d)])) as Record<Cue, ReturnType<typeof defineSound>>;

// On by default; switched off in Settings, for this browser only.
const KEY = 'marginalia.sounds';
export function soundsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setSoundsOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch { /* private window: the choice lasts this page */ }
}

// A browser lets a page play sound only after the person touched it: the audio starts on the first
// click or key, and a cue before that is dropped.
let ready = false;
export function unlockOnGesture() {
  const unlock = () => {
    void ensureReady().then(() => {
      setMasterVolume(0.8);
      ready = true;
    }).catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}

export function play(cue: Cue) {
  if (!ready || !soundsOn()) return;
  try {
    players[cue]();
  } catch { /* no audio device: stay silent */ }
}
