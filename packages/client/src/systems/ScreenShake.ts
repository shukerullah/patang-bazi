// ============================================
// PATANG BAZI — Screen Shake
// Returns offset for camera to apply
// (no longer directly sets container position)
// ============================================

interface ShakeInstance {
  intensity: number;
  duration: number;
  elapsed: number;
}

export class ScreenShake {
  private shakes: ShakeInstance[] = [];

  // Current offset (read by camera/game each frame)
  offsetX = 0;
  offsetY = 0;

  /** Trigger a shake */
  shake(intensity = 8, duration = 0.3) {
    this.shakes.push({ intensity, duration, elapsed: 0 });
  }

  /** Small shake */
  light() { this.shake(4, 0.15); }

  /** Medium shake */
  medium() { this.shake(10, 0.3); }

  /** Big shake for kite cut */
  heavy() { this.shake(18, 0.45); }

  /** Call every frame — updates offsetX/offsetY */
  update(dt: number) {
    this.offsetX = 0;
    this.offsetY = 0;

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
      this.offsetX += (Math.random() * 2 - 1) * power;
      this.offsetY += (Math.random() * 2 - 1) * power;
    }
  }

  get isShaking(): boolean {
    return this.shakes.length > 0;
  }
}
