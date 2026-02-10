// ============================================
// PATANG BAZI — Ground Renderer
// Rolling hills silhouette at bottom of screen
// ============================================

import { Container, Graphics } from 'pixi.js';
import { WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y } from '@patang/shared';

export class GroundRenderer {
  constructor(parent: Container) {
    const container = new Container();
    parent.addChild(container);

    // Dark hill layer (back)
    const hill1 = new Graphics();
    hill1.moveTo(0, WORLD_HEIGHT);
    for (let x = 0; x <= WORLD_WIDTH; x += 4) {
      const h = Math.sin(x * 0.003) * 18 + Math.sin(x * 0.007 + 1) * 10 + Math.sin(x * 0.0015) * 25;
      hill1.lineTo(x, GROUND_Y + h);
    }
    hill1.lineTo(WORLD_WIDTH, WORLD_HEIGHT);
    hill1.closePath();
    hill1.fill(0x1a0e08);
    container.addChild(hill1);

    // Lighter hill layer (front)
    const hill2 = new Graphics();
    hill2.moveTo(0, WORLD_HEIGHT);
    for (let x = 0; x <= WORLD_WIDTH; x += 4) {
      const h = Math.sin(x * 0.004 + 2) * 12 + Math.sin(x * 0.009 + 3) * 8;
      hill2.lineTo(x, GROUND_Y + 15 + h);
    }
    hill2.lineTo(WORLD_WIDTH, WORLD_HEIGHT);
    hill2.closePath();
    hill2.fill(0x2a1a0e);
    container.addChild(hill2);
  }
}
