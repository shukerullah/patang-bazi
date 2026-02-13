// ============================================
// PATANG BAZI — Player View
// Visual representation of one player:
// kite + string + person + name label
// ============================================

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { KiteRenderer, type KiteColors } from './KiteRenderer';
import { StringRenderer } from './StringRenderer';
import { PersonRenderer } from './PersonRenderer';
import { PLAYER_COLORS } from '@patang/shared';
import type { KiteState, WindState, Vec2 } from '@patang/shared';

/** Convert hex string "#rrggbb" to number */
function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export class PlayerView {
  public container: Container;
  public kiteRenderer: KiteRenderer;
  public stringRenderer: StringRenderer;
  public personRenderer: PersonRenderer;

  private nameLabel: Text;
  private deadOverlay: Graphics;
  public isLocalPlayer: boolean;

  public playerId: string;
  public colorIndex: number;

  // Respawn fade-in tracking
  private wasAlive = true;
  private respawnFade = 1; // 0 = invisible, 1 = fully visible

  constructor(
    parent: Container,
    playerId: string,
    playerName: string,
    colorIndex: number,
    isLocal: boolean,
  ) {
    this.playerId = playerId;
    this.colorIndex = colorIndex;
    this.isLocalPlayer = isLocal;

    this.container = new Container();
    parent.addChild(this.container);

    // Map color index to kite colors
    const palette = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
    const colors: KiteColors = {
      top: hexToNum(palette.primary),
      bottom: hexToNum(palette.secondary),
      tail3: isLocal ? 0x3d8bfd : 0xf39c12,
    };

    this.stringRenderer = new StringRenderer(this.container);
    this.personRenderer = new PersonRenderer(this.container);
    this.kiteRenderer = new KiteRenderer(this.container, colors);

    // Name label above kite
    const labelStyle = new TextStyle({
      fontFamily: 'Poppins, sans-serif',
      fontSize: isLocal ? 13 : 11,
      fontWeight: 'bold',
      fill: isLocal ? '#ffd666' : '#ffffff',
      dropShadow: {
        color: '#000000',
        blur: 4,
        distance: 0,
        alpha: 0.6,
      },
    });
    this.nameLabel = new Text({ text: playerName, style: labelStyle });
    this.nameLabel.anchor.set(0.5, 1);
    this.container.addChild(this.nameLabel);

    // Dead overlay (shown when kite is cut)
    this.deadOverlay = new Graphics();
    this.deadOverlay.visible = false;
    this.container.addChild(this.deadOverlay);

    // Remote players slightly transparent
    if (!isLocal) {
      this.container.alpha = 0.85;
    }
  }

  update(
    kite: KiteState,
    anchor: Vec2,
    wind: WindState,
    isPulling: boolean,
    gameTime: number,
  ) {
    if (!kite.alive) {
      this.container.visible = false;
      this.wasAlive = false;
      return;
    }

    // Respawn fade-in: if we just came back alive, start from 0
    if (!this.wasAlive) {
      this.respawnFade = 0;
      this.wasAlive = true;
    }
    this.respawnFade = Math.min(1, this.respawnFade + 0.03); // ~0.5s fade-in at 60fps

    this.container.visible = true;

    // Apply respawn fade to kite scale + alpha for a smooth entrance
    const fadeScale = 0.6 + this.respawnFade * 0.4; // scale 0.6 → 1.0
    this.kiteRenderer.container.scale.set(fadeScale);
    this.kiteRenderer.container.alpha = this.respawnFade;

    // Update sub-renderers
    this.kiteRenderer.update(kite, wind);
    this.stringRenderer.update(anchor, kite.position, isPulling, gameTime);
    this.personRenderer.update(anchor, kite.position);

    // Position name label above kite
    this.nameLabel.position.set(kite.position.x, kite.position.y - 42);
  }

  setName(name: string) {
    this.nameLabel.text = name;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
