// ============================================
// PATANG BAZI — Pench Renderer
// Visual sparks at string crossing + tension bar
// winnerId-aware: shows winning/losing state
// ============================================

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Vec2 } from '@patang/shared';

interface ActivePench {
  position: Vec2;
  progress: number;     // 0 → 1 (accumulated tension)
  displayProgress: number; // lerped for smooth visual
  playerAId: string;
  playerBId: string;
  winnerId: string;
  sparkTimer: number;
  sparks: Spark[];
  age: number;          // seconds since start
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

  /**
   * Ensure a pench exists (create if new, update IDs if existing).
   * Called from schema sync every frame — must NOT reset progress.
   */
  ensurePench(key: string, playerAId: string, playerBId: string, position: Vec2, winnerId: string) {
    const existing = this.penches.get(key);
    if (existing) {
      // Only update IDs and winner — progress comes from syncProgress
      existing.playerAId = playerAId;
      existing.playerBId = playerBId;
      existing.winnerId = winnerId;
      existing.position = position;
      return;
    }
    // New pench
    this.penches.set(key, {
      position,
      progress: 0,
      displayProgress: 0,
      playerAId,
      playerBId,
      winnerId,
      sparkTimer: 0,
      sparks: [],
      age: 0,
    });
  }

  /** Sync progress from server (schema or message) */
  syncProgress(key: string, progress: number, position: Vec2, winnerId?: string) {
    const p = this.penches.get(key);
    if (!p) return;
    p.progress = progress;
    p.position = position;
    if (winnerId !== undefined) p.winnerId = winnerId;
  }

  /** Remove a pench (cut or separated) */
  removePench(key: string) {
    this.penches.delete(key);
  }

  /** Get all tracked pench keys (for cleanup) */
  getActiveKeys(): Set<string> {
    return new Set(this.penches.keys());
  }

  // --- Legacy message API (still called by event handlers) ---

  onPenchStart(key: string, playerAId: string, playerBId: string, position: Vec2) {
    this.ensurePench(key, playerAId, playerBId, position, '');
  }

  onPenchUpdate(key: string, progress: number, position: Vec2) {
    this.syncProgress(key, progress, position);
  }

  onPenchEnd(key: string) {
    this.removePench(key);
  }

  update(dt: number) {
    this.sparkGraphics.clear();
    this.meterGraphics.clear();

    let showMeter = false;
    let meterProgress = 0;
    let meterPos: Vec2 = { x: 0, y: 0 };
    let localIsWinning = false;

    for (const [key, pench] of this.penches) {
      pench.age += dt;

      // Smooth lerp displayProgress toward actual progress
      const lerpSpeed = 8;
      pench.displayProgress += (pench.progress - pench.displayProgress) * Math.min(1, lerpSpeed * dt);

      // Skip cut burst entries for meter (they have empty IDs)
      const isCutBurst = key === '__cut_burst__';

      // Emit sparks — rate and count scale with progress
      pench.sparkTimer += dt;
      const sparkInterval = Math.max(0.015, 0.05 - pench.displayProgress * 0.035);
      if (pench.sparkTimer > sparkInterval) {
        pench.sparkTimer = 0;
        const count = 1 + Math.floor(pench.displayProgress * 5);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1 + Math.random() * 3 + pench.displayProgress * 4;
          pench.sparks.push({
            x: pench.position.x + (Math.random() - 0.5) * 12,
            y: pench.position.y + (Math.random() - 0.5) * 12,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.5,
            life: 0.25 + Math.random() * 0.4 + pench.displayProgress * 0.2,
            size: 1.5 + Math.random() * 2 + pench.displayProgress * 1.5,
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

        // Color: yellow → orange → red based on progress
        const r = 255;
        const g = Math.floor(200 - pench.displayProgress * 150);
        const b = Math.floor(60 - pench.displayProgress * 60);
        const color = (r << 16) | (g << 8) | b;

        this.sparkGraphics.circle(s.x, s.y, s.size * s.life);
        this.sparkGraphics.fill({ color, alpha: s.life * 0.85 });
      }

      // Crossing point glow
      const glowSize = 12 + pench.displayProgress * 30;
      const glowAlpha = 0.12 + pench.displayProgress * 0.3;
      this.sparkGraphics.circle(pench.position.x, pench.position.y, glowSize);
      this.sparkGraphics.fill({ color: 0xff4422, alpha: glowAlpha });

      // Outer pulse ring at high progress
      if (pench.displayProgress > 0.6) {
        const pulseSize = glowSize + 8 + Math.sin(pench.age * 12) * 6;
        const pulseAlpha = (pench.displayProgress - 0.6) * 0.4;
        this.sparkGraphics.circle(pench.position.x, pench.position.y, pulseSize);
        this.sparkGraphics.stroke({ width: 1.5, color: 0xff6644, alpha: pulseAlpha });
      }

      // Check if local player involved — show meter
      if (
        !isCutBurst &&
        this.localPlayerId &&
        (pench.playerAId === this.localPlayerId || pench.playerBId === this.localPlayerId)
      ) {
        showMeter = true;
        meterProgress = pench.displayProgress;
        meterPos = pench.position;
        localIsWinning = pench.winnerId === this.localPlayerId;
      }
    }

    // Draw tension meter near crossing point (only for local player)
    if (showMeter) {
      this.drawTensionMeter(meterPos, meterProgress, localIsWinning);
    } else {
      this.meterText.visible = false;
    }
  }

  private drawTensionMeter(pos: Vec2, progress: number, isWinning: boolean) {
    this.meterText.visible = true;

    const barW = 90;
    const barH = 10;
    const bx = pos.x - barW / 2;
    const by = pos.y - 28;

    this.meterText.position.set(pos.x, by - 4);

    // Background bar
    this.meterGraphics.roundRect(bx - 1, by - 1, barW + 2, barH + 2, 5);
    this.meterGraphics.fill({ color: 0x000000, alpha: 0.6 });

    // Fill bar — color based on winning/losing
    const fillW = barW * progress;
    let fillColor: number;
    if (isWinning) {
      // Winning: green → gold as progress increases
      fillColor = progress < 0.5 ? 0x44cc44 : progress < 0.8 ? 0xffd666 : 0xff8833;
    } else {
      // Losing: yellow → orange → red (danger!)
      fillColor = progress < 0.4 ? 0xffd666 : progress < 0.7 ? 0xff6633 : 0xff2222;
    }

    if (fillW > 0) {
      this.meterGraphics.roundRect(bx, by, fillW, barH, 4);
      this.meterGraphics.fill({ color: fillColor, alpha: 0.9 });
    }

    // Border
    this.meterGraphics.roundRect(bx, by, barW, barH, 4);
    this.meterGraphics.stroke({ width: 1, color: 0xffffff, alpha: 0.25 });

    // Tick marks at 25%, 50%, 75%
    for (const t of [0.25, 0.5, 0.75]) {
      const tx = bx + barW * t;
      this.meterGraphics.moveTo(tx, by);
      this.meterGraphics.lineTo(tx, by + barH);
      this.meterGraphics.stroke({ width: 0.5, color: 0xffffff, alpha: 0.15 });
    }

    // Text label
    if (progress > 0.75) {
      if (isWinning) {
        this.meterText.text = '🔥 CUTTING!';
        this.meterText.style.fill = '#ff8833';
      } else {
        this.meterText.text = '⚠️ DANGER!';
        this.meterText.style.fill = '#ff2222';
      }
      this.meterText.scale.set(1 + Math.sin(Date.now() * 0.012) * 0.08);
    } else if (progress > 0.4) {
      this.meterText.text = isWinning ? '💪 PULLING!' : '⚔️ PENCH!';
      this.meterText.style.fill = isWinning ? '#44cc44' : '#ff4444';
      this.meterText.scale.set(1);
    } else {
      this.meterText.text = '⚔️ PENCH!';
      this.meterText.style.fill = '#ff4444';
      this.meterText.scale.set(1);
    }
  }

  /** Big burst when a kite gets cut */
  cutBurst(position: Vec2) {
    const key = '__cut_burst__';
    const pench: ActivePench = {
      position,
      progress: 1,
      displayProgress: 1,
      playerAId: '',
      playerBId: '',
      winnerId: '',
      sparkTimer: 0,
      sparks: [],
      age: 0,
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
    setTimeout(() => this.penches.delete(key), 1500);
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
