// ============================================
// PATANG BAZI — Kite Renderer
// Diamond kite with cross sticks & tail ribbons
// ============================================

import { Container, Graphics } from 'pixi.js';
import type { KiteState, WindState } from '@patang/shared';

export interface KiteColors {
  top: number;
  bottom: number;
  tail3: number;
}

const DEFAULT_COLORS: KiteColors = {
  top: 0xe8403a,
  bottom: 0xf4b942,
  tail3: 0x3d8bfd,
};

export class KiteRenderer {
  public container: Container;
  private body: Graphics;
  private tails: Graphics;
  private glow: Graphics;

  private kw = 22; // kite half-width
  private kh = 30; // kite half-height
  private colors: KiteColors;

  constructor(parent: Container, colors?: KiteColors) {
    this.colors = colors ?? DEFAULT_COLORS;
    this.container = new Container();
    parent.addChild(this.container);

    // Glow behind kite
    this.glow = new Graphics();
    this.container.addChild(this.glow);

    // Kite body
    this.body = new Graphics();
    this.container.addChild(this.body);

    // Tail ribbons (drawn every frame)
    this.tails = new Graphics();
    this.container.addChild(this.tails);

    this.drawBody();
    this.drawGlow();
  }

  private drawBody() {
    const g = this.body;
    const { kw, kh } = this;

    g.clear();

    // Top half
    g.moveTo(0, -kh);
    g.lineTo(kw, 0);
    g.lineTo(0, 2);
    g.lineTo(-kw, 0);
    g.closePath();
    g.fill(this.colors.top);

    // Bottom half
    g.moveTo(-kw, 0);
    g.lineTo(0, 2);
    g.lineTo(kw, 0);
    g.lineTo(0, kh);
    g.closePath();
    g.fill(this.colors.bottom);

    // Cross sticks
    g.moveTo(0, -kh);
    g.lineTo(0, kh);
    g.stroke({ width: 1.5, color: 0x503814, alpha: 0.6 });

    g.moveTo(-kw, 0);
    g.lineTo(kw, 0);
    g.stroke({ width: 1.5, color: 0x503814, alpha: 0.6 });

    // Center dot
    g.circle(0, 0, 3);
    g.fill(0xffffff);
  }

  private drawGlow() {
    const g = this.glow;
    g.clear();
    // Simple glow circle
    g.circle(0, 0, 45);
    g.fill({ color: 0xff6432, alpha: 0.12 });
    g.circle(0, 0, 25);
    g.fill({ color: 0xff6432, alpha: 0.08 });
  }

  update(kite: KiteState, wind: WindState) {
    this.container.position.set(kite.position.x, kite.position.y);
    this.container.rotation = kite.angle * 0.06;

    // Redraw tail ribbons (they animate)
    this.drawTails(kite.tailPhase, wind);
  }

  private drawTails(tailPhase: number, wind: WindState) {
    const g = this.tails;
    const { kh } = this;
    g.clear();

    this.drawOneRibbon(g, 0, kh, 60, this.colors.top, tailPhase, 0, wind);
    this.drawOneRibbon(g, -5, kh - 2, 42, this.colors.bottom, tailPhase, 0.5, wind);
    this.drawOneRibbon(g, 5, kh - 2, 42, this.colors.tail3, tailPhase, 1, wind);
  }

  private drawOneRibbon(
    g: Graphics,
    startX: number, startY: number,
    length: number, color: number,
    phase: number, phaseOffset: number,
    wind: WindState,
  ) {
    const segs = 15;
    g.moveTo(startX, startY);

    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const px = startX + Math.sin(phase + t * 4 + phaseOffset) * (10 + t * 15);
      const py = startY + t * length;
      const windPush = wind.speed * wind.direction * t * 8;
      g.lineTo(px + windPush, py);
    }

    g.stroke({ width: 2, color, alpha: 1 });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
