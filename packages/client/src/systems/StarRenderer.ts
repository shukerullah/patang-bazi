// ============================================
// PATANG BAZI — Star Renderer
// Collectible stars with glow, rotation,
// pop-in appear & pop-out disappear animations
// No opacity/progress/countdown — clean pops only
// ============================================

import { Container, Graphics } from 'pixi.js';
import type { Vec2 } from '@patang/shared';

export interface StarData {
  id: string;
  position: Vec2;
  size: number;
  active: boolean;
  pulse: number;
}

type StarPhase = 'appearing' | 'visible' | 'disappearing';

const APPEAR_DURATION = 0.35;    // seconds for pop-in
const DISAPPEAR_DURATION = 0.25; // seconds for pop-out

interface StarEntry {
  data: StarData;
  graphics: Graphics;
  glowGraphics: Graphics;
  phase: StarPhase;
  phaseTime: number;  // seconds elapsed in current phase
}

export class StarRenderer {
  private container: Container;
  private stars: Map<string, StarEntry> = new Map();

  // Track which stars were collected (not expired) so we skip disappear anim
  private collectedIds = new Set<string>();

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);
  }

  /** Sync the star list from server state */
  syncStars(starList: StarData[]) {
    const activeIds = new Set<string>();
    for (const s of starList) {
      if (s.active) activeIds.add(s.id);
    }

    // Stars no longer active → start disappear (unless collected or already disappearing)
    for (const [id, entry] of this.stars) {
      if (!activeIds.has(id) && entry.phase !== 'disappearing') {
        if (this.collectedIds.has(id)) {
          // Collected stars are removed instantly (particles handle the visual)
          this.collectedIds.delete(id);
          entry.graphics.destroy();
          entry.glowGraphics.destroy();
          this.stars.delete(id);
        } else {
          // Timer expired: play disappear animation
          entry.phase = 'disappearing';
          entry.phaseTime = 0;
        }
      }
    }

    // Add new stars (with appear animation)
    for (const star of starList) {
      if (!star.active) continue;
      if (!this.stars.has(star.id)) {
        const glowGraphics = new Graphics();
        const graphics = new Graphics();
        this.container.addChild(glowGraphics);
        this.container.addChild(graphics);
        this.stars.set(star.id, {
          data: star,
          graphics,
          glowGraphics,
          phase: 'appearing',
          phaseTime: 0,
        });
      } else {
        this.stars.get(star.id)!.data = star;
      }
    }
  }

  update(gameTime: number, dt: number) {
    const toRemove: string[] = [];

    for (const [id, entry] of this.stars) {
      const { data, graphics: g, glowGraphics: glow } = entry;

      entry.phaseTime += dt;

      // Phase transitions
      if (entry.phase === 'appearing' && entry.phaseTime >= APPEAR_DURATION) {
        entry.phase = 'visible';
        entry.phaseTime = 0;
      }
      if (entry.phase === 'disappearing' && entry.phaseTime >= DISAPPEAR_DURATION) {
        toRemove.push(id);
        continue;
      }

      // Calculate scale based on phase
      let scale = 1;
      if (entry.phase === 'appearing') {
        const t = Math.min(1, entry.phaseTime / APPEAR_DURATION);
        scale = easeOutBack(t);
      } else if (entry.phase === 'disappearing') {
        const t = Math.min(1, entry.phaseTime / DISAPPEAR_DURATION);
        scale = 1 - easeInBack(t);
        if (scale < 0) scale = 0;
      }

      // Pulse (only when visible or appearing)
      data.pulse += 0.03;
      const pulseScale = entry.phase !== 'disappearing'
        ? Math.sin(data.pulse) * 0.15 + 1
        : 1;
      const sz = data.size * pulseScale * scale;

      if (sz < 0.5) {
        glow.clear();
        g.clear();
        continue;
      }

      // Glow
      glow.clear();
      glow.circle(data.position.x, data.position.y, sz * 2.5);
      glow.fill({ color: 0xffd666, alpha: 0.2 });

      // Star shape
      g.clear();
      const cx = data.position.x;
      const cy = data.position.y;
      const outerR = sz;
      const innerR = sz * 0.5;
      const rotation = gameTime * 0.5;

      g.moveTo(
        cx + Math.cos(rotation - Math.PI / 2) * outerR,
        cy + Math.sin(rotation - Math.PI / 2) * outerR,
      );

      for (let i = 1; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (Math.PI * 2 * i) / 10 - Math.PI / 2 + rotation;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
      g.fill(0xffd666);
    }

    // Destroy completed disappearing stars
    for (const id of toRemove) {
      const entry = this.stars.get(id);
      if (entry) {
        entry.graphics.destroy();
        entry.glowGraphics.destroy();
        this.stars.delete(id);
      }
    }
  }

  /** Remove a star immediately (for collection — particles handle the visual) */
  collectStar(id: string): Vec2 | null {
    const entry = this.stars.get(id);
    if (!entry) return null;
    const pos = { ...entry.data.position };
    this.collectedIds.add(id);
    entry.graphics.destroy();
    entry.glowGraphics.destroy();
    this.stars.delete(id);
    return pos;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

// --- Easing functions ---

/** Elastic overshoot on appear */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Quick pullback on disappear */
function easeInBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}
