// ============================================
// PATANG BAZI — Camera System
// Follows local kite smoothly, clamps to world
// ============================================

import { WORLD_WIDTH, WORLD_HEIGHT } from '@patang/shared';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export class Camera {
  // Camera center in world coords
  x = WORLD_WIDTH / 2;
  y = WORLD_HEIGHT / 2;

  // Viewport size in world coords
  viewW = WORLD_WIDTH;
  viewH = WORLD_HEIGHT;

  // Screen dimensions
  screenW = 1920;
  screenH = 1080;

  // Scale factor (world → screen)
  scale = 1;

  // Smooth follow
  private targetX = WORLD_WIDTH / 2;
  private targetY = WORLD_HEIGHT / 2;
  private readonly LERP_SPEED = 3.5;

  // Deadzone: camera doesn't move for small kite movements
  private readonly DEADZONE_X = 60;
  private readonly DEADZONE_Y = 40;

  /** Call on window resize */
  setViewport(screenW: number, screenH: number) {
    this.screenW = screenW;
    this.screenH = screenH;

    // FILL: use Math.max so world always covers screen
    const scaleX = screenW / WORLD_WIDTH;
    const scaleY = screenH / WORLD_HEIGHT;
    this.scale = Math.max(scaleX, scaleY);

    // Viewport in world coords
    this.viewW = screenW / this.scale;
    this.viewH = screenH / this.scale;
  }

  /** Follow a world position (typically the kite) */
  follow(worldX: number, worldY: number, dt: number) {
    // Offset: show more sky above the kite (look-ahead up)
    const offsetY = -this.viewH * 0.12;

    const desiredX = worldX;
    const desiredY = worldY + offsetY;

    // Deadzone: only update target if kite moves outside deadzone
    const dx = desiredX - this.targetX;
    const dy = desiredY - this.targetY;

    if (Math.abs(dx) > this.DEADZONE_X) {
      this.targetX += dx - Math.sign(dx) * this.DEADZONE_X;
    }
    if (Math.abs(dy) > this.DEADZONE_Y) {
      this.targetY += dy - Math.sign(dy) * this.DEADZONE_Y;
    }

    // Clamp target to world bounds (so viewport never goes outside world)
    const halfW = this.viewW / 2;
    const halfH = this.viewH / 2;
    this.targetX = clamp(this.targetX, halfW, WORLD_WIDTH - halfW);
    this.targetY = clamp(this.targetY, halfH, WORLD_HEIGHT - halfH);

    // Smooth lerp toward target
    const t = 1 - Math.exp(-this.LERP_SPEED * dt);
    this.x += (this.targetX - this.x) * t;
    this.y += (this.targetY - this.y) * t;

    // Also clamp actual position
    this.x = clamp(this.x, halfW, WORLD_WIDTH - halfW);
    this.y = clamp(this.y, halfH, WORLD_HEIGHT - halfH);
  }

  /** Snap camera to position immediately (no lerp) */
  snapTo(worldX: number, worldY: number) {
    const offsetY = -this.viewH * 0.12;
    this.targetX = worldX;
    this.targetY = worldY + offsetY;

    const halfW = this.viewW / 2;
    const halfH = this.viewH / 2;
    this.targetX = clamp(this.targetX, halfW, WORLD_WIDTH - halfW);
    this.targetY = clamp(this.targetY, halfH, WORLD_HEIGHT - halfH);

    this.x = this.targetX;
    this.y = this.targetY;
  }

  /** Get the world container translation to apply */
  getWorldTranslation(): { x: number; y: number } {
    return {
      x: this.screenW / 2 - this.x * this.scale,
      y: this.screenH / 2 - this.y * this.scale,
    };
  }

  /** Get the visible world rect (for culling/background rendering) */
  getWorldBounds(): { left: number; top: number; right: number; bottom: number } {
    return {
      left: this.x - this.viewW / 2,
      top: this.y - this.viewH / 2,
      right: this.x + this.viewW / 2,
      bottom: this.y + this.viewH / 2,
    };
  }

  /** Convert world Y to screen Y (for bg rendering) */
  worldToScreenY(worldY: number): number {
    return (worldY - this.y) * this.scale + this.screenH / 2;
  }

  /** Convert world X to screen X */
  worldToScreenX(worldX: number): number {
    return (worldX - this.x) * this.scale + this.screenW / 2;
  }

  /** Get normalized camera Y (0 = top of world, 1 = bottom) */
  getNormalizedY(): number {
    return clamp(this.y / WORLD_HEIGHT, 0, 1);
  }
}
