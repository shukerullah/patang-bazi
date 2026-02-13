// ============================================
// PATANG BAZI — Cloud Renderer
// Soft translucent clouds drifting with wind
// ============================================

import { Container, Graphics } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '@patang/shared';
import type { WindState } from '@patang/shared';

interface Cloud {
  x: number;
  y: number;
  w: number;
  speed: number;
  opacity: number;
}

export class CloudRenderer {
  private graphics: Graphics;
  private clouds: Cloud[] = [];

  constructor(parent: Container) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);

    // Generate clouds — visible but not distracting
    for (let i = 0; i < 12; i++) {
      this.clouds.push({
        x: Math.random() * WORLD_WIDTH,
        y: WORLD_HEIGHT * 0.05 + Math.random() * WORLD_HEIGHT * 0.4,
        w: 100 + Math.random() * 200,
        speed: 0.15 + Math.random() * 0.4,
        opacity: 0.08 + Math.random() * 0.12,
      });
    }
  }

  update(wind: WindState) {
    const g = this.graphics;
    g.clear();

    for (const c of this.clouds) {
      c.x += c.speed * wind.direction;
      if (c.x > WORLD_WIDTH + c.w) c.x = -c.w;
      if (c.x < -c.w) c.x = WORLD_WIDTH + c.w;

      // Main body
      g.ellipse(c.x, c.y, c.w / 2, c.w / 5);
      g.fill({ color: 0xffffff, alpha: c.opacity });

      // Upper bump
      g.ellipse(c.x - c.w * 0.2, c.y - c.w * 0.06, c.w / 3, c.w / 6);
      g.fill({ color: 0xffffff, alpha: c.opacity });

      // Lower bump
      g.ellipse(c.x + c.w * 0.2, c.y + c.w * 0.03, c.w / 3.5, c.w / 7);
      g.fill({ color: 0xffffff, alpha: c.opacity });
    }
  }

  destroy() {
    this.graphics.destroy();
  }
}
