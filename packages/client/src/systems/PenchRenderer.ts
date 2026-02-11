// ============================================
// PATANG BAZI — Pench Renderer
// Visual sparks at string crossing + tension bar
// ============================================

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Vec2 } from '@patang/shared';

interface ActivePench {
  position: Vec2;
  progress: number;     // 0 → 1
  attackerId: string;
  defenderId: string;
  sparkTimer: number;
  sparks: Spark[];
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

export class PenchRenderer {
  private container: Container;
  private sparkGraphics: Graphics;
  private meterGraphics: Graphics;
  private meterText: Text;

  private penches = new Map<string, ActivePench>();
  private localPlayerId: string | null = null;

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);

    this.sparkGraphics = new Graphics();
    this.container.addChild(this.sparkGraphics);

    this.meterGraphics = new Graphics();
    this.container.addChild(this.meterGraphics);

    const style = new TextStyle({
      fontFamily: 'Baloo 2, cursive',
      fontSize: 16,
      fontWeight: 'bold',
      fill: '#ff4444',
      dropShadow: { color: '#000000', blur: 4, distance: 0, alpha: 0.8 },
    });
    this.meterText = new Text({ text: '⚔️ PENCH!', style });
    this.meterText.anchor.set(0.5, 1);
    this.meterText.visible = false;
    this.container.addChild(this.meterText);
  }

  setLocalPlayer(id: string) {
    this.localPlayerId = id;
  }

  /** Called when server says pench started */
  onPenchStart(key: string, attackerId: string, defenderId: string, position: Vec2) {
    this.penches.set(key, {
      position,
      progress: 0,
      attackerId,
      defenderId,
      sparkTimer: 0,
      sparks: [],
    });
  }

  /** Called when server updates pench progress */
  onPenchUpdate(key: string, progress: number, position: Vec2) {
    const p = this.penches.get(key);
    if (p) {
      p.progress = progress;
      p.position = position;
    }
  }

  /** Called when pench ends (cut or separated) */
  onPenchEnd(key: string) {
    this.penches.delete(key);
  }

  update(dt: number) {
    this.sparkGraphics.clear();
    this.meterGraphics.clear();

    let showMeter = false;
    let meterProgress = 0;
    let meterPos: Vec2 = { x: 0, y: 0 };

    for (const [, pench] of this.penches) {
      // Emit sparks
      pench.sparkTimer += dt;
      if (pench.sparkTimer > 0.03) {
        pench.sparkTimer = 0;
        const count = 2 + Math.floor(pench.progress * 4);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1 + Math.random() * 4 + pench.progress * 3;
          pench.sparks.push({
            x: pench.position.x + (Math.random() - 0.5) * 10,
            y: pench.position.y + (Math.random() - 0.5) * 10,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            life: 0.3 + Math.random() * 0.4,
            size: 1.5 + Math.random() * 2.5,
          });
        }
      }

      // Update & draw sparks
      for (let i = pench.sparks.length - 1; i >= 0; i--) {
        const s = pench.sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12;
        s.life -= dt * 3;

        if (s.life <= 0) {
          pench.sparks.splice(i, 1);
          continue;
        }

        // Color from yellow → orange → red based on progress
        const r = 255;
        const g = Math.floor(200 - pench.progress * 150);
        const b = Math.floor(50 - pench.progress * 50);
        const color = (r << 16) | (g << 8) | b;

        this.sparkGraphics.circle(s.x, s.y, s.size * s.life);
        this.sparkGraphics.fill({ color, alpha: s.life * 0.9 });
      }

      // Crossing point glow
      const glowSize = 15 + pench.progress * 25;
      const glowAlpha = 0.15 + pench.progress * 0.25;
      this.sparkGraphics.circle(pench.position.x, pench.position.y, glowSize);
      this.sparkGraphics.fill({ color: 0xff4422, alpha: glowAlpha });

      // Check if local player involved
      if (
        this.localPlayerId &&
        (pench.attackerId === this.localPlayerId || pench.defenderId === this.localPlayerId)
      ) {
        showMeter = true;
        meterProgress = pench.progress;
        meterPos = pench.position;
      }
    }

    // Draw tension meter near crossing point
    if (showMeter) {
      this.meterText.visible = true;
      this.meterText.position.set(meterPos.x, meterPos.y - 30);

      // Meter bar background
      const barW = 80;
      const barH = 8;
      const bx = meterPos.x - barW / 2;
      const by = meterPos.y - 22;

      // BG
      this.meterGraphics.roundRect(bx, by, barW, barH, 4);
      this.meterGraphics.fill({ color: 0x000000, alpha: 0.5 });

      // Fill (green → yellow → red)
      const fillW = barW * meterProgress;
      const fillColor = meterProgress < 0.5
        ? 0xffd666
        : meterProgress < 0.8
          ? 0xff8833
          : 0xff2222;
      if (fillW > 0) {
        this.meterGraphics.roundRect(bx, by, fillW, barH, 4);
        this.meterGraphics.fill({ color: fillColor, alpha: 0.9 });
      }

      // Border
      this.meterGraphics.roundRect(bx, by, barW, barH, 4);
      this.meterGraphics.stroke({ width: 1, color: 0xffffff, alpha: 0.3 });

      // Pulse the text when close to cut
      if (meterProgress > 0.7) {
        this.meterText.text = '🔥 CUTTING!';
        this.meterText.scale.set(1 + Math.sin(Date.now() * 0.01) * 0.1);
      } else {
        this.meterText.text = '⚔️ PENCH!';
        this.meterText.scale.set(1);
      }
    } else {
      this.meterText.visible = false;
    }
  }

  /** Big burst when a kite gets cut */
  cutBurst(position: Vec2) {
    const key = '__cut_burst__';
    const pench: ActivePench = {
      position,
      progress: 1,
      attackerId: '',
      defenderId: '',
      sparkTimer: 0,
      sparks: [],
    };

    // Massive spark explosion
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 8;
      pench.sparks.push({
        x: position.x + (Math.random() - 0.5) * 15,
        y: position.y + (Math.random() - 0.5) * 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 0.5 + Math.random() * 0.8,
        size: 2 + Math.random() * 4,
      });
    }

    this.penches.set(key, pench);
    // Auto-remove after sparks die
    setTimeout(() => this.penches.delete(key), 1500);
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
