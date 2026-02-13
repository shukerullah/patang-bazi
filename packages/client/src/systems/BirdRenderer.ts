// ============================================
// PATANG BAZI — Bird Renderer
// Simple silhouette birds flying across sky
// ============================================

import { Container, Graphics } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '@patang/shared';

interface Bird {
  x: number;
  y: number;
  speed: number;
  wingPhase: number;
  dir: number;
}

export class BirdRenderer {
  private graphics: Graphics;
  private birds: Bird[] = [];

  constructor(parent: Container) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);

    for (let i = 0; i < 6; i++) {
      this.birds.push({
        x: Math.random() * WORLD_WIDTH,
        y: WORLD_HEIGHT * 0.08 + Math.random() * WORLD_HEIGHT * 0.35,
        speed: 0.5 + Math.random() * 1,
        wingPhase: Math.random() * Math.PI * 2,
        dir: Math.random() > 0.5 ? 1 : -1,
      });
    }
  }

  update(gameTime: number, dt: number) {
    const g = this.graphics;
    g.clear();

    for (const b of this.birds) {
      b.x += b.speed * b.dir;
      b.wingPhase += dt * 8;
      b.y += Math.sin(gameTime * 0.8 + b.wingPhase) * 0.3;

      if (b.x > WORLD_WIDTH + 50) { b.x = -50; b.dir = 1; }
      if (b.x < -50) { b.x = WORLD_WIDTH + 50; b.dir = -1; }

      const wing = Math.sin(b.wingPhase) * 10;

      g.moveTo(b.x - 12, b.y + wing);
      g.quadraticCurveTo(b.x, b.y - 4, b.x + 12, b.y + wing);
      g.stroke({ width: 2.5, color: 0x1a0a2e, alpha: 0.7 });
    }
  }

  destroy() {
    this.graphics.destroy();
  }
}
