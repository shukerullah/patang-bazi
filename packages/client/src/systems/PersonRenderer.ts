// ============================================
// PATANG BAZI — Person Renderer
// Stick figure at anchor point holding the string
// ============================================

import { Container, Graphics } from 'pixi.js';
import type { Vec2 } from '@patang/shared';

export class PersonRenderer {
  private graphics: Graphics;

  constructor(parent: Container) {
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
  }

  update(anchor: Vec2, kitePos: Vec2) {
    const g = this.graphics;
    const px = anchor.x;
    const py = anchor.y;
    const lookAngle = Math.atan2(kitePos.y - py, kitePos.x - px);

    g.clear();

    // Body
    g.moveTo(px, py);
    g.lineTo(px, py - 20);
    g.stroke({ width: 3, color: 0x1e0f0a, alpha: 0.8, cap: 'round' });

    // Head
    g.circle(px, py - 24, 5);
    g.fill({ color: 0x1e0f0a, alpha: 0.8 });

    // Arm pointing toward kite
    g.moveTo(px, py - 14);
    g.lineTo(
      px + Math.cos(lookAngle) * 12,
      py - 14 + Math.sin(lookAngle) * 8,
    );
    g.stroke({ width: 3, color: 0x1e0f0a, alpha: 0.8, cap: 'round' });

    // Legs
    g.moveTo(px, py);
    g.lineTo(px - 6, py + 12);
    g.stroke({ width: 3, color: 0x1e0f0a, alpha: 0.8, cap: 'round' });

    g.moveTo(px, py);
    g.lineTo(px + 6, py + 12);
    g.stroke({ width: 3, color: 0x1e0f0a, alpha: 0.8, cap: 'round' });
  }

  destroy() {
    this.graphics.destroy();
  }
}
