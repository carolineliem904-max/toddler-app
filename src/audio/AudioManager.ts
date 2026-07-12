import { VOICE_MANIFEST, VOICE_DIR, PRAISE_VOICE_KEYS, type VoiceKey } from './voiceManifest';

export type SfxKey = 'select' | 'wrong' | 'correct' | 'celebrate' | 'click';

interface ToneOpts {
  type?: OscillatorType;
  peak?: number;
  sweepTo?: number;
}

// The ONLY module that touches raw audio (WebAudio synthesis + voice
// playback). Scenes call semantic methods (sfx('correct'), voice('theme_colors_intro'))
// and never deal with AudioContext, buffers, gain envelopes, or file paths —
// see CLAUDE.md-style "renderer registry" precedent: keep the mechanic/menu
// scenes free of a whole category of implementation detail.
//
// One module-level singleton (not a per-scene instance) because MenuScene
// and MatchScene both need to share mute state and a single AudioContext
// across scene.start()/restart() calls.
class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private muted = false;
  private unlocked = false;
  private readonly voiceBuffers = new Map<VoiceKey, AudioBuffer>();

  /**
   * Must be triggered from a genuine user gesture (browsers block
   * AudioContext creation/resume before one). Wired to a capture-phase
   * document 'pointerdown' listener in main.ts so it fires before any
   * scene's own tap handler, regardless of which element is tapped first —
   * safer than hanging it off one specific button. Idempotent/safe to call
   * more than once.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    void this.preloadVoices();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  sfx(key: SfxKey): void {
    if (this.muted || !this.ctx) return;
    switch (key) {
      case 'select':
        this.playPop();
        break;
      case 'wrong':
        this.playBoop();
        break;
      case 'correct':
        this.playChime();
        break;
      case 'celebrate':
        this.playFanfare();
        break;
      case 'click':
        this.playClick();
        break;
    }
  }

  /** Plays a voice line if its file loaded successfully; silently no-ops otherwise (missing file, still loading, or muted). */
  voice(key: VoiceKey): void {
    if (this.muted || !this.ctx) return;
    const buffer = this.voiceBuffers.get(key);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  randomPraiseKey(): VoiceKey {
    return PRAISE_VOICE_KEYS[Math.floor(Math.random() * PRAISE_VOICE_KEYS.length)]!;
  }

  // Fetches every manifest entry once, right after unlock(). Missing files
  // (404 or any fetch/decode failure) are collected and reported as ONE
  // consolidated console.info — not one log per file — so the zero-files
  // default state (all 9 missing) doesn't spam the console, while a fully
  // recorded set produces zero log output at all.
  private async preloadVoices(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const keys = Object.keys(VOICE_MANIFEST) as VoiceKey[];
    const missing: VoiceKey[] = [];
    await Promise.all(
      keys.map(async (key) => {
        try {
          const url = `${import.meta.env.BASE_URL}${VOICE_DIR}${VOICE_MANIFEST[key].file}`;
          const res = await fetch(url);
          if (!res.ok) {
            missing.push(key);
            return;
          }
          const arrayBuffer = await res.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          this.voiceBuffers.set(key, audioBuffer);
        } catch {
          missing.push(key);
        }
      }),
    );
    if (missing.length > 0) {
      console.info(
        `[AudioManager] ${missing.length}/${keys.length} voice line(s) not found — running without them: ${missing.join(', ')}`,
      );
    }
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  // One-note WebAudio synth helper: an oscillator with a linear pitch sweep
  // (optional) and a fast-attack/exponential-decay gain envelope. Every SFX
  // in this file is built from one or more calls to this.
  private playTone(freq: number, offset: number, duration: number, opts: ToneOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = this.now() + offset;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.sweepTo !== undefined) {
      osc.frequency.linearRampToValueAtTime(opts.sweepTo, t0 + duration);
    }
    const gain = ctx.createGain();
    const peak = opts.peak ?? 0.25;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.015, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  // Select: soft downward pop. ~120ms.
  private playPop(): void {
    this.playTone(700, 0, 0.12, { type: 'sine', sweepTo: 350, peak: 0.22 });
  }

  // Menu card tap / home button: tiny high tick. ~50ms.
  private playClick(): void {
    this.playTone(900, 0, 0.05, { type: 'triangle', peak: 0.18 });
  }

  // Wrong match: deliberately NOT a descending buzz or minor interval (those
  // read as "sad"/punishing to a toddler) — a single sine tone that sweeps
  // gently UP (392Hz -> 440Hz, a curious "hm?" contour) at moderate volume,
  // same short duration class as the other cues. See HANDOFF for why this
  // choice was made.
  private playBoop(): void {
    this.playTone(392, 0, 0.22, { type: 'sine', sweepTo: 440, peak: 0.2 });
  }

  // Correct match: rising major triad (C5-E5-G5), xylophone-ish triangle wave.
  private playChime(): void {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => this.playTone(f, i * 0.07, 0.18, { type: 'triangle', peak: 0.22 }));
  }

  // Celebration: sparkly ascending run + a quiet octave-up shimmer layer.
  // Last note starts at 0.45s + 0.35s duration = 0.8s total, comfortably
  // under the 1.5s ceiling.
  private playFanfare(): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    scale.forEach((f, i) => this.playTone(f, i * 0.09, 0.35, { type: 'triangle', peak: 0.2 }));
    scale.forEach((f, i) => this.playTone(f * 2, i * 0.09 + 0.03, 0.25, { type: 'sine', peak: 0.08 }));
  }
}

export const AudioManager = new AudioManagerImpl();
