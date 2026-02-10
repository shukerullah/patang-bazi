// ============================================
// PATANG BAZI — Sky Renderer
// Beautiful sunset sky with PixiJS Graphics
// ============================================

import { Container, Graphics } from 'pixi.js';

/** Color stop for sky gradient */
interface SkyStop {
  offset: number;
  color: number;
}

const SUNSET_PALETTE: SkyStop[] = [
  { offset: 0.00, color: 0x0b0633 },
  { offset: 0.25, color: 0x1a1055 },
  { offset: 0.45, color: 0x3d1d6e },
  { offset: 0.60, color: 0x8b3a62 },
  { offset: 0.75, color: 0xd4614e },
  { offset: 0.88, color: 0xf4a43a },
  { offset: 1.00, color: 0xf7d672 },
];

export class SkyRenderer {
  private container: Container;
  private skyGraphics: Graphics;
  private sunGraphics: Graphics;
  private starsGraphics: Graphics;

  private worldW: number;
  private worldH: number;

  // Pre-calculated star positions (deterministic)
  private bgStars: Array<{ x: number; y: number; seed: number }> = [];

  constructor(parent: Container, worldW: number, worldH: number) {
    this.container = new Container();
    parent.addChild(this.container);
    this.worldW = worldW;
    this.worldH = worldH;

    // Sky gradient (drawn once, updated rarely)
    this.skyGraphics = new Graphics();
    this.container.addChild(this.skyGraphics);

    // Sun glow
    this.sunGraphics = new Graphics();
    this.container.addChild(this.sunGraphics);

    // Background twinkle stars
    this.starsGraphics = new Graphics();
    this.container.addChild(this.starsGraphics);

    // Generate deterministic star positions
    const seed = 12345;
    for (let i = 0; i < 60; i++) {
      this.bgStars.push({
        x: (seed * (i + 1) * 7919) % worldW,
        y: (seed * (i + 1) * 104729) % (worldH * 0.4),
        seed: i * 1.5,
      });
    }

    this.drawSky();
    this.drawSun();
  }

  private drawSky() {
    const g = this.skyGraphics;
    g.clear();

    // PixiJS v8: draw sky as vertical stripes to simulate gradient
    const stripH = 4;
    const totalStrips = Math.ceil(this.worldH / stripH);

    for (let i = 0; i < totalStrips; i++) {
      const t = i / totalStrips;
      const color = this.sampleGradient(t);
      g.rect(0, i * stripH, this.worldW, stripH + 1);
      g.fill(color);
    }
  }

  private drawSun() {
    const g = this.sunGraphics;
    g.clear();

    const sunX = this.worldW * 0.7;
    const sunY = this.worldH * 0.82;

    // Layered circles for glow effect
    const layers = [
      { radius: this.worldH * 0.08, alpha: 0.35, color: 0xffdc78 },
      { radius: this.worldH * 0.15, alpha: 0.15, color: 0xffb450 },
      { radius: this.worldH * 0.25, alpha: 0.06, color: 0xff8040 },
      { radius: this.worldH * 0.4, alpha: 0.02, color: 0xff6432 },
    ];

    for (const layer of layers) {
      g.circle(sunX, sunY, layer.radius);
      g.fill({ color: layer.color, alpha: layer.alpha });
    }
  }

  update(gameTime: number) {
    // Update twinkling background stars
    const g = this.starsGraphics;
    g.clear();

    for (const star of this.bgStars) {
      const twinkle = Math.sin(gameTime * 2 + star.seed) * 0.5 + 0.5;
      const alpha = 0.15 + twinkle * 0.4;
      const radius = 0.8 + twinkle * 1;

      g.circle(star.x, star.y, radius);
      g.fill({ color: 0xffffff, alpha });
    }
  }

  /** Linearly interpolate the sky gradient at position t (0–1) */
  private sampleGradient(t: number): number {
    const palette = SUNSET_PALETTE;

    // Find surrounding stops
    for (let i = 0; i < palette.length - 1; i++) {
      if (t >= palette[i].offset && t <= palette[i + 1].offset) {
        const localT =
          (t - palette[i].offset) / (palette[i + 1].offset - palette[i].offset);
        return this.lerpColor(palette[i].color, palette[i + 1].color, localT);
      }
    }

    return palette[palette.length - 1].color;
  }

  /** Lerp two hex colors */
  private lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;

    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;

    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);

    return (r << 16) | (g << 8) | bl;
  }
}
