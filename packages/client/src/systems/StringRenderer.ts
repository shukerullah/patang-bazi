// ============================================
// PATANG BAZI — String Renderer
// Catenary string from anchor to kite
// ============================================

import { Graphics, Container } from 'pixi.js';
import { STRING_SAG_PULL, STRING_SAG_GLIDE } from '@patang/shared';
import type { Vec2 } from '@patang/shared';

export class StringRenderer {
  private graphics: Graphics;
  private segments = 30;

  constructor(parent: Container) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  update(
    anchor: Vec2,
    kitePos: Vec2,
    isPulling: boolean,
    gameTime: number,
  ) {
    const g = this.graphics;
    g.clear();

    const sagAmount = isPulling ? STRING_SAG_PULL : STRING_SAG_GLIDE;

    // Build path
    let first = true;
    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments;
      const lx = anchor.x + (kitePos.x - anchor.x) * t;
      const ly = anchor.y + (kitePos.y - anchor.y) * t;

      // Catenary sag
      const sag = Math.sin(t * Math.PI) * sagAmount * (1 - t * 0.5);
      // Wind sway
      const sway = Math.sin(gameTime * 2 + t * 6) * 3 * (isPulling ? 0.3 : 1);

      if (first) {
        g.moveTo(lx + sway, ly + sag);
        first = false;
      } else {
        g.lineTo(lx + sway, ly + sag);
      }
    }

    g.stroke({ width: 1.2, color: 0xffffff, alpha: 0.35 });
  }

  destroy() {
    this.graphics.destroy();
  }
}
