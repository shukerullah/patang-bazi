// ============================================
// PATANG BAZI — Particle System
// Simple burst particles for star collection
// ============================================

import { Container, Graphics } from 'pixi.js';
import type { Vec2 } from '@patang/shared';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
  size: number;
}

const BURST_COLORS = [0xffd666, 0xffaa33, 0xff6b6b, 0xffffff];

export class ParticleSystem {
  private graphics: Graphics;
  private particles: Particle[] = [];

  constructor(parent: Container) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  /** Emit a burst of particles at a position */
  burst(pos: Vec2, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 2 + Math.random() * 3;
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
        size: 3 + Math.random() * 4,
      });
    }
  }

  update(dt: number) {
    const g = this.graphics;
    g.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gravity
      p.life -= dt * 2;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      g.circle(p.x, p.y, p.size * p.life);
      g.fill({ color: p.color, alpha: p.life });
    }
  }

  destroy() {
    this.graphics.destroy();
  }
}
