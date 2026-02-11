// ============================================
// PATANG BAZI — Screen Shake
// Shakes a container for impact feel
// ============================================

import { Container } from 'pixi.js';

interface ShakeInstance {
  intensity: number;
  duration: number;
  elapsed: number;
}

export class ScreenShake {
  private target: Container;
  private baseX = 0;
  private baseY = 0;
  private shakes: ShakeInstance[] = [];

  constructor(target: Container) {
    this.target = target;
  }

  /** Trigger a shake */
  shake(intensity = 8, duration = 0.3) {
    this.shakes.push({ intensity, duration, elapsed: 0 });
  }

  /** Small shake */
  light() {
    this.shake(4, 0.15);
  }

  /** Medium shake */
  medium() {
    this.shake(10, 0.3);
  }

  /** Big shake for kite cut */
  heavy() {
    this.shake(18, 0.45);
  }

  /** Call before applying world position */
  saveBase(x: number, y: number) {
    this.baseX = x;
    this.baseY = y;
  }

  /** Call every frame to apply shake offset */
  update(dt: number) {
    let offsetX = 0;
    let offsetY = 0;

    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i];
      s.elapsed += dt;

      if (s.elapsed >= s.duration) {
        this.shakes.splice(i, 1);
        continue;
      }

      // Decay
      const remaining = 1 - s.elapsed / s.duration;
      const power = s.intensity * remaining;

      offsetX += (Math.random() * 2 - 1) * power;
      offsetY += (Math.random() * 2 - 1) * power;
    }

    this.target.position.set(
      this.baseX + offsetX,
      this.baseY + offsetY,
    );
  }

  get isShaking(): boolean {
    return this.shakes.length > 0;
  }
}
