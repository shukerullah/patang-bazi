// ============================================
// PATANG BAZI — Sky Renderer (Viewport-Aware)
// Always fills the screen. Gradient shifts with
// camera position for parallax feel.
// ============================================

import { Container, Graphics } from 'pixi.js';
import { WORLD_HEIGHT } from '@patang/shared';
import type { Camera } from './Camera';

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

  private screenW = 1920;
  private screenH = 1080;

  // Cache: avoid redrawing 270+ rects every frame when camera hasn't moved
  private lastCamY = -999;
  private lastCamViewH = -999;
  private lastScreenH = -1;

  // Pre-calculated star positions (deterministic)
  private bgStars: Array<{ x: number; y: number; seed: number }> = [];

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);

    // Sky gradient (drawn once, updated rarely)
    this.skyGraphics = new Graphics();
    this.container.addChild(this.skyGraphics);

    // Sun glow
    this.sunGraphics = new Graphics();
    this.container.addChild(this.sunGraphics);

    // Background twinkle stars
    this.starsGraphics = new Graphics();
    this.container.addChild(this.starsGraphics);

    // Generate stars across a large area (will be positioned relative to camera)
    for (let i = 0; i < 80; i++) {
      const seed = 12345;
      this.bgStars.push({
        x: ((seed * (i + 1) * 7919) % 3000) - 500,
        y: ((seed * (i + 1) * 104729) % 600),
        seed: i * 1.5,
      });
    }
  }

  /** Call on resize */
  setScreenSize(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
    // Force sky redraw on next update
    this.lastCamY = -999;
  }

  /** Redraw sky + sun based on camera position */
  update(gameTime: number, camera: Camera) {
    // Sky gradient: only redraw if camera moved enough to matter (>2px equivalent)
    const camChanged = Math.abs(camera.y - this.lastCamY) > 2
      || Math.abs(camera.viewH - this.lastCamViewH) > 1
      || this.screenH !== this.lastScreenH;

    if (camChanged) {
      this.drawSky(camera);
      this.lastCamY = camera.y;
      this.lastCamViewH = camera.viewH;
      this.lastScreenH = this.screenH;
    }

    this.drawSun(camera);
    this.drawStars(gameTime, camera);
  }

  private drawSky(camera: Camera) {
    const g = this.skyGraphics;
    g.clear();

    // Visible world Y range
    const viewTop = camera.y - camera.viewH / 2;
    const viewBottom = camera.y + camera.viewH / 2;

    // Draw full-screen gradient strips
    const stripH = 4;
    const totalStrips = Math.ceil(this.screenH / stripH);

    for (let i = 0; i < totalStrips; i++) {
      const screenY = i * stripH;
      // Map screen Y to world Y, then to gradient t
      const worldY = viewTop + (screenY / this.screenH) * (viewBottom - viewTop);
      const t = Math.max(0, Math.min(1, worldY / WORLD_HEIGHT));
      const color = this.sampleGradient(t);

      g.rect(0, screenY, this.screenW, stripH + 1);
      g.fill(color);
    }
  }

  private drawSun(camera: Camera) {
    const g = this.sunGraphics;
    g.clear();

    // Sun position in world coords
    const sunWorldX = 1920 * 0.7;
    const sunWorldY = WORLD_HEIGHT * 0.82;

    // Convert to screen coords
    const sunX = camera.worldToScreenX(sunWorldX);
    const sunY = camera.worldToScreenY(sunWorldY);

    // Scale layers based on camera scale
    const baseSize = WORLD_HEIGHT * camera.scale;

    const layers = [
      { radius: baseSize * 0.08, alpha: 0.35, color: 0xffdc78 },
      { radius: baseSize * 0.15, alpha: 0.15, color: 0xffb450 },
      { radius: baseSize * 0.25, alpha: 0.06, color: 0xff8040 },
      { radius: baseSize * 0.4, alpha: 0.02, color: 0xff6432 },
    ];

    for (const layer of layers) {
      g.circle(sunX, sunY, layer.radius);
      g.fill({ color: layer.color, alpha: layer.alpha });
    }
  }

  private drawStars(gameTime: number, camera: Camera) {
    const g = this.starsGraphics;
    g.clear();

    // Only draw stars in the dark part of sky (top 40%)
    for (const star of this.bgStars) {
      // Stars are in world-relative coords (scattered in upper portion)
      const screenX = camera.worldToScreenX(star.x);
      const screenY = camera.worldToScreenY(star.y);

      // Skip if off screen
      if (screenX < -10 || screenX > this.screenW + 10) continue;
      if (screenY < -10 || screenY > this.screenH * 0.5) continue;

      const twinkle = Math.sin(gameTime * 2 + star.seed) * 0.5 + 0.5;
      const alpha = 0.15 + twinkle * 0.4;
      const radius = 0.8 + twinkle * 1;

      g.circle(screenX, screenY, radius);
      g.fill({ color: 0xffffff, alpha });
    }
  }

  /** Linearly interpolate the sky gradient at position t (0–1) */
  private sampleGradient(t: number): number {
    const palette = SUNSET_PALETTE;

    // Find surrounding stops
    for (let i = 0; i < palette.length - 1; i++) {
      if (t >= palette[i].offset && t <= palette[i + 1].offset) {
        const localT = (t - palette[i].offset) / (palette[i + 1].offset - palette[i].offset);
        return this.lerpColor(palette[i].color, palette[i + 1].color, localT);
      }
    }
    return palette[palette.length - 1].color;
  }

  /** Lerp two hex colors */
  private lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const gv = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (gv << 8) | bl;
  }
}
