// ============================================
// PATANG BAZI — Star Renderer
// Collectible stars with glow & rotation
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

export class StarRenderer {
  private container: Container;
  private stars: Map<string, { data: StarData; graphics: Graphics; glowGraphics: Graphics }> = new Map();

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);
  }

  /** Sync the star list (add new, remove collected) */
  syncStars(starList: StarData[]) {
    const activeIds = new Set(starList.filter(s => s.active).map(s => s.id));

    // Remove stars no longer active
    for (const [id, entry] of this.stars) {
      if (!activeIds.has(id)) {
        entry.graphics.destroy();
        entry.glowGraphics.destroy();
        this.stars.delete(id);
      }
    }

    // Add new stars
    for (const star of starList) {
      if (!star.active) continue;
      if (!this.stars.has(star.id)) {
        const glowGraphics = new Graphics();
        const graphics = new Graphics();
        this.container.addChild(glowGraphics);
        this.container.addChild(graphics);
        this.stars.set(star.id, { data: star, graphics, glowGraphics });
      } else {
        this.stars.get(star.id)!.data = star;
      }
    }
  }

  update(gameTime: number) {
    for (const [, entry] of this.stars) {
      const { data, graphics: g, glowGraphics: glow } = entry;
      data.pulse += 0.03;
      const pulseScale = Math.sin(data.pulse) * 0.15 + 1;
      const sz = data.size * pulseScale;

      // Glow
      glow.clear();
      glow.circle(data.position.x, data.position.y, sz * 2.5);
      glow.fill({ color: 0xffd666, alpha: 0.2 });

      // Star shape
      g.clear();
      g.position.set(0, 0);

      // Draw 5-pointed star
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
  }

  /** Remove a star with animation trigger */
  collectStar(id: string): Vec2 | null {
    const entry = this.stars.get(id);
    if (!entry) return null;
    const pos = { ...entry.data.position };
    entry.graphics.destroy();
    entry.glowGraphics.destroy();
    this.stars.delete(id);
    return pos;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
