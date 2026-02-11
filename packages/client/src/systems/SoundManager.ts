// ============================================
// PATANG BAZI — Sound Manager
// Procedural Web Audio sounds — no files needed
// All param values guarded against NaN/Infinity
// ============================================

/** Safely set an AudioParam value, skipping NaN/Infinity */
function safeRamp(param: AudioParam, value: number, time: number) {
  if (!Number.isFinite(value) || !Number.isFinite(time)) return;
  param.linearRampToValueAtTime(value, Math.max(time, 0));
}

function safeSet(param: AudioParam, value: number, time: number) {
  if (!Number.isFinite(value) || !Number.isFinite(time)) return;
  param.setValueAtTime(value, Math.max(time, 0));
}

function safeExpRamp(param: AudioParam, value: number, time: number) {
  if (!Number.isFinite(value) || !Number.isFinite(time) || value <= 0) return;
  param.exponentialRampToValueAtTime(value, Math.max(time, 0));
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private initialized = false;

  // Looping sounds
  private windGain: GainNode | null = null;
  private tensionOsc: OscillatorNode | null = null;
  private tensionGain: GainNode | null = null;

  private muted = false;

  /** Must be called after user interaction (click/key) */
  init() {
    if (this.initialized) return;

    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.4;
      this.masterGain.connect(this.ctx.destination);

      this.startWindLoop();
      this.startTensionLoop();
      this.initialized = true;
    } catch (e) {
      console.warn('Audio init failed:', e);
    }
  }

  private ensure(): boolean {
    if (!this.initialized) return false;
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return true;
  }

  // ========================
  // WIND AMBIENCE (continuous)
  // ========================

  private startWindLoop() {
    if (!this.ctx) return;

    // Brown noise approximation using filtered white noise
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.08;

    noiseSource.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    noiseSource.start();

    // Slow LFO for wind variation
    const windLfo = this.ctx.createOscillator();
    windLfo.type = 'sine';
    windLfo.frequency.value = 0.15;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.04;
    windLfo.connect(lfoGain);
    lfoGain.connect(this.windGain.gain);
    windLfo.start();
  }

  /** Update wind volume based on wind speed — safe for NaN/0 */
  setWindIntensity(speed: number) {
    if (!this.windGain || !this.ctx || !this.initialized) return;
    if (!Number.isFinite(speed)) return;
    const target = 0.04 + Math.max(0, speed) * 0.08;
    safeRamp(this.windGain.gain, target, this.ctx.currentTime + 0.3);
  }

  // ========================
  // STRING TENSION HUM (during pull)
  // ========================

  private startTensionLoop() {
    if (!this.ctx) return;

    this.tensionOsc = this.ctx.createOscillator();
    this.tensionOsc.type = 'sine';
    this.tensionOsc.frequency.value = 180;

    this.tensionGain = this.ctx.createGain();
    this.tensionGain.gain.value = 0;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 200;
    filter.Q.value = 5;

    this.tensionOsc.connect(filter);
    filter.connect(this.tensionGain);
    this.tensionGain.connect(this.masterGain);
    this.tensionOsc.start();
  }

  /** Set string tension sound (0 = silent, 1 = max) */
  setTension(amount: number) {
    if (!this.tensionGain || !this.tensionOsc || !this.ctx || !this.initialized) return;
    if (!Number.isFinite(amount)) return;
    const vol = Math.max(0, amount) * 0.06;
    const freq = 150 + Math.max(0, amount) * 120;
    safeRamp(this.tensionGain.gain, vol, this.ctx.currentTime + 0.05);
    safeRamp(this.tensionOsc.frequency, freq, this.ctx.currentTime + 0.05);
  }

  // ========================
  // ONE-SHOT SOUNDS
  // ========================

  /** Star collected — bright ascending chime */
  playStarCollect() {
    if (!this.ensure()) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Two quick ascending tones
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.08;
      safeSet(osc.frequency, 800 + i * 400, t);
      safeExpRamp(osc.frequency, 1400 + i * 400, t + 0.12);
      safeSet(gain.gain, 0.12, t);
      safeExpRamp(gain.gain, 0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  /** Pench sparking — crackling metallic friction */
  playPenchSpark() {
    if (!this.ensure()) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;


    // Short noise burst (string grinding)
    const bufLen = Math.floor(this.ctx.sampleRate * 0.08);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000 + Math.random() * 3000;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.08;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
  }

  /** Kite cut — sharp snap + falling whoosh */
  playKiteCut() {
    if (!this.ensure()) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // SNAP: short bright noise burst
    const snapLen = Math.floor(this.ctx.sampleRate * 0.06);
    const snapBuf = this.ctx.createBuffer(1, snapLen, this.ctx.sampleRate);
    const snapData = snapBuf.getChannelData(0);
    for (let i = 0; i < snapLen; i++) {
      snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapLen * 0.15));
    }
    const snapSrc = this.ctx.createBufferSource();
    snapSrc.buffer = snapBuf;
    const snapGain = this.ctx.createGain();
    snapGain.gain.value = 0.25;
    snapSrc.connect(snapGain);
    snapGain.connect(this.masterGain);
    snapSrc.start(now);

    // WHOOSH: descending tone
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    safeSet(osc.frequency, 600, now + 0.05);
    safeExpRamp(osc.frequency, 80, now + 0.6);
    const whooshGain = this.ctx.createGain();
    safeSet(whooshGain.gain, 0.08, now + 0.05);
    safeExpRamp(whooshGain.gain, 0.001, now + 0.6);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    osc.connect(filter);
    filter.connect(whooshGain);
    whooshGain.connect(this.masterGain);
    osc.start(now + 0.05);
    osc.stop(now + 0.7);
  }

  /** Crowd reaction — noise burst shaped like "ohhh!" */
  playCrowdCheer() {
    if (!this.ensure()) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const duration = 1.2;
    const bufLen = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);

    // Layered noise with formant-like shaping
    let lastOut = 0;
    for (let i = 0; i < bufLen; i++) {
      const t = i / bufLen;
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.05 * white) / 1.05;
      // Envelope: quick attack, slow fade
      const env = Math.min(1, t * 8) * Math.exp(-t * 3);
      data[i] = lastOut * env * 4;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 1.5;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.15;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
  }

  /** Countdown beep */
  playCountdownBeep(final = false) {
    if (!this.ensure()) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = final ? 880 : 440;
    const gain = this.ctx.createGain();
    safeSet(gain.gain, 0.15, now);
    safeExpRamp(gain.gain, 0.001, now + (final ? 0.4 : 0.15));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (final ? 0.5 : 0.2));
  }

  /** Player joined whoosh */
  playPlayerJoined() {
    if (!this.ensure()) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Quick bright ascending tone
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    safeSet(osc.frequency, 400, now);
    safeExpRamp(osc.frequency, 900, now + 0.15);
    const gain = this.ctx.createGain();
    safeSet(gain.gain, 0.1, now);
    safeExpRamp(gain.gain, 0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  // ========================
  // CONTROLS
  // ========================

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.4;
    }
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  destroy() {
    this.ctx?.close();
    this.ctx = null;
    this.initialized = false;
  }
}
