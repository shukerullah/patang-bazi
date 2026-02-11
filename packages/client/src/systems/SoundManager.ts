// ============================================
// PATANG BAZI — Sound Manager
// Procedural Web Audio sounds — no files needed
// Wind loop, string tension, star chime, cut snap,
// crowd cheer, pench sparks
// ============================================

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;

  // Looping sounds
  public windOsc: OscillatorNode | null = null;
  private windGain: GainNode | null = null;
  private windLfo: OscillatorNode | null = null;

  private tensionOsc: OscillatorNode | null = null;
  private tensionGain: GainNode | null = null;

  private muted = false;

  /** Must be called after user interaction (click/key) */
  init() {
    if (this.ctx) return;

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;
    this.masterGain.connect(this.ctx.destination);

    this.startWindLoop();
    this.startTensionLoop();
  }

  private ensure() {
    if (!this.ctx) this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
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
    this.windLfo = this.ctx.createOscillator();
    this.windLfo.type = 'sine';
    this.windLfo.frequency.value = 0.15;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.04;
    this.windLfo.connect(lfoGain);
    lfoGain.connect(this.windGain.gain);
    this.windLfo.start();
  }

  /** Update wind volume based on wind speed */
  setWindIntensity(speed: number) {
    if (!this.windGain) return;
    const target = 0.04 + speed * 0.08;
    this.windGain.gain.linearRampToValueAtTime(
      target, (this.ctx?.currentTime ?? 0) + 0.3
    );
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
    if (!this.tensionGain || !this.tensionOsc || !this.ctx) return;
    const vol = amount * 0.06;
    const freq = 150 + amount * 120;
    this.tensionGain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.05);
    this.tensionOsc.frequency.linearRampToValueAtTime(freq, this.ctx.currentTime + 0.05);
  }

  // ========================
  // ONE-SHOT SOUNDS
  // ========================

  /** Star collected — bright ascending chime */
  playStarCollect() {
    this.ensure();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Two quick ascending tones
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800 + i * 400, now + i * 0.08);
      osc.frequency.exponentialRampToValueAtTime(1400 + i * 400, now + i * 0.08 + 0.12);
      gain.gain.setValueAtTime(0.12, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.3);
    }
  }

  /** Pench sparking — crackling metallic friction */
  playPenchSpark() {
    this.ensure();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Short noise burst (string grinding)
    const bufLen = this.ctx.sampleRate * 0.08;
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
    this.ensure();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // SNAP: short bright noise burst
    const snapLen = this.ctx.sampleRate * 0.06;
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
    osc.frequency.setValueAtTime(600, now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.6);
    const whooshGain = this.ctx.createGain();
    whooshGain.gain.setValueAtTime(0.08, now + 0.05);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
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
    this.ensure();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const duration = 1.2;
    const bufLen = this.ctx.sampleRate * duration;
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
    this.ensure();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = final ? 880 : 440;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (final ? 0.4 : 0.15));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (final ? 0.5 : 0.2));
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
  }
}
