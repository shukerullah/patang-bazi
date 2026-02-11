// ============================================
// PATANG BAZI — Game Core (Multiplayer)
// Hot-join, toast notifications, input throttle,
// progressive pench, sound, screen shake
// ============================================

import { Application, Container } from 'pixi.js';
import { InputManager } from '../systems/InputManager';
import { NetworkManager } from '../network/NetworkManager';
import { SkyRenderer } from '../systems/SkyRenderer';
import { GroundRenderer } from '../systems/GroundRenderer';
import { CloudRenderer } from '../systems/CloudRenderer';
import { BirdRenderer } from '../systems/BirdRenderer';
import { StarRenderer, type StarData } from '../systems/StarRenderer';
import { ParticleSystem } from '../systems/ParticleSystem';
import { PlayerView } from '../systems/PlayerView';
import { PenchRenderer } from '../systems/PenchRenderer';
import { SoundManager } from '../systems/SoundManager';
import { ScreenShake } from '../systems/ScreenShake';
import { LobbyUI } from '../ui/LobbyUI';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TICK_RATE,
  FIXED_DT,
  PLAYER_COLORS,
  STAR_POINTS,
  SCORE_KITE_CUT,
  stepKite,
  type PlayerInput,
  type KiteState,
  type WindState,
} from '@patang/shared';

function getServerUrl(): string {
  const host = window.location.hostname;
  const port = 2567;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${host}:${port}`;
}

// ========================
// TOAST NOTIFICATION SYSTEM
// ========================

interface Toast {
  el: HTMLDivElement;
  expiry: number;
}

class ToastManager {
  private container: HTMLDivElement;
  private toasts: Toast[] = [];

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position: fixed; top: 60px; left: 16px; z-index: 25;
      display: flex; flex-direction: column; gap: 6px;
      pointer-events: none; font-family: 'Poppins', sans-serif;
    `;
    document.body.appendChild(this.container);
  }

  show(text: string, colorDot?: string, duration = 3500) {
    const el = document.createElement('div');
    el.style.cssText = `
      background: rgba(0,0,0,0.55); backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
      padding: 6px 14px; font-size: 12px; font-weight: 500;
      color: rgba(255,255,255,0.85); display: flex; align-items: center; gap: 8px;
      opacity: 0; transform: translateX(-20px);
      transition: opacity 0.3s ease, transform 0.3s ease;
    `;

    if (colorDot) {
      const dot = document.createElement('span');
      dot.style.cssText = `
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        background: ${colorDot};
      `;
      el.appendChild(dot);
    }

    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);

    this.container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });

    const toast: Toast = { el, expiry: Date.now() + duration };
    this.toasts.push(toast);

    // Auto-remove
    setTimeout(() => this.removeToast(toast), duration);

    // Cap at 5 visible
    while (this.toasts.length > 5) {
      this.removeToast(this.toasts[0]);
    }
  }

  private removeToast(toast: Toast) {
    const idx = this.toasts.indexOf(toast);
    if (idx === -1) return;
    this.toasts.splice(idx, 1);

    toast.el.style.opacity = '0';
    toast.el.style.transform = 'translateX(-20px)';
    setTimeout(() => toast.el.remove(), 300);
  }
}

// ========================
// GAME
// ========================

export class Game {
  private app: Application;
  private input: InputManager;
  private network: NetworkManager;

  // Scene
  private worldContainer!: Container;
  private skyLayer!: Container;
  private cloudLayer!: Container;
  private gameLayer!: Container;
  private effectLayer!: Container;

  // Background
  private skyRenderer!: SkyRenderer;
  private cloudRenderer!: CloudRenderer;
  private birdRenderer!: BirdRenderer;
  private starRenderer!: StarRenderer;
  private particleSystem!: ParticleSystem;

  // Effects
  private penchRenderer!: PenchRenderer;
  private sound!: SoundManager;
  private screenShake!: ScreenShake;

  // Players
  private playerViews = new Map<string, PlayerView>();
  private localPlayerId: string | null = null;
  public playerName = 'Player';

  // Timing
  private gameTime = 0;
  private inputSeq = 0;
  private inputSendAccum = 0;        // Accumulator for throttled input sending
  private readonly INPUT_SEND_INTERVAL = 1 / TICK_RATE;  // Send at tick rate

  // Track last input to avoid redundant sends
  private lastSentPull = false;
  private lastSentSteer = 0;

  // UI
  private lobbyUI!: LobbyUI;
  private toasts!: ToastManager;
  public hudEl: HTMLDivElement | null = null;

  // HUD refs
  private hudHeight!: HTMLElement;
  private hudScore!: HTMLElement;
  private hudWind!: HTMLElement;
  private hudPhase!: HTMLElement;
  private hudTime!: HTMLElement;
  private hudPlayers!: HTMLElement;
  private muteBtn!: HTMLButtonElement;

  constructor(app: Application, input: InputManager, network: NetworkManager) {
    this.app = app;
    this.input = input;
    this.network = network;
  }

  async init() {
    this.sound = new SoundManager();
    this.toasts = new ToastManager();
    this.setupSceneGraph();
    this.setupRenderers();
    this.setupHUD();
    this.showLobby();
    this.startRenderLoop();
  }

  // ========================
  // SETUP
  // ========================

  private setupSceneGraph() {
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.skyLayer = new Container();
    this.cloudLayer = new Container();
    this.gameLayer = new Container();
    this.effectLayer = new Container();

    this.worldContainer.addChild(this.skyLayer, this.cloudLayer, this.gameLayer, this.effectLayer);

    this.screenShake = new ScreenShake(this.worldContainer);
    this.onResize(window.innerWidth, window.innerHeight);
  }

  private setupRenderers() {
    this.skyRenderer = new SkyRenderer(this.skyLayer, WORLD_WIDTH, WORLD_HEIGHT);
    this.cloudRenderer = new CloudRenderer(this.cloudLayer);
    this.birdRenderer = new BirdRenderer(this.cloudLayer);
    new GroundRenderer(this.skyLayer);
    this.starRenderer = new StarRenderer(this.gameLayer);
    this.penchRenderer = new PenchRenderer(this.effectLayer);
    this.particleSystem = new ParticleSystem(this.effectLayer);
  }

  private setupHUD() {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <style>
        #hud {
          position: fixed; top: 0; left: 0; right: 0;
          padding: 16px 24px;
          display: flex; justify-content: space-between; align-items: flex-start;
          pointer-events: none; z-index: 10;
          font-family: 'Poppins', sans-serif;
        }
        .hud-left { display: flex; flex-direction: column; gap: 6px; }
        .game-title {
          font-family: 'Baloo 2', cursive; font-size: 24px; font-weight: 800; color: #fff;
          text-shadow: 0 2px 20px rgba(255,150,50,0.4); line-height: 1;
        }
        .hud-phase { font-size: 12px; color: rgba(255,255,255,0.4); font-weight: 500; }
        .stats { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
        .stat-pill {
          background: rgba(0,0,0,0.35); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
          padding: 4px 12px; font-size: 12px; font-weight: 500;
          color: rgba(255,255,255,0.7); display: flex; align-items: center; gap: 5px;
        }
        .stat-pill .val { color: #ffd666; font-weight: 700; font-size: 13px; }
        .mute-btn {
          background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 50%; width: 32px; height: 32px;
          font-size: 16px; cursor: pointer; pointer-events: auto;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.7); transition: background 0.2s;
        }
        .mute-btn:hover { background: rgba(255,255,255,0.1); }
        #score-popup {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          z-index: 20; pointer-events: none;
          font-family: 'Baloo 2', cursive; font-size: 48px; font-weight: 800;
          color: #ffd666; text-shadow: 0 4px 30px rgba(255,180,50,0.6);
          opacity: 0; transition: opacity 0.3s, transform 0.3s;
        }
        #score-popup.show { opacity: 1; transform: translate(-50%, -60%); }
        #score-popup.cut { color: #ff4444; text-shadow: 0 4px 30px rgba(255,50,50,0.6); }
        .scoreboard {
          position: fixed; top: 50px; right: 16px; z-index: 10; pointer-events: none;
          display: flex; flex-direction: column; gap: 4px;
        }
        .sb-row {
          background: rgba(0,0,0,0.3); backdrop-filter: blur(8px);
          border-radius: 8px; padding: 4px 12px; font-size: 12px;
          color: rgba(255,255,255,0.8); display: flex; align-items: center; gap: 8px;
          border: 1px solid rgba(255,255,255,0.06);
          font-family: 'Poppins', sans-serif;
        }
        .sb-row.local { border-color: rgba(255,214,102,0.3); }
        .sb-row.dead { opacity: 0.4; }
        .sb-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .sb-name { flex: 1; }
        .sb-score { color: #ffd666; font-weight: 700; }
        #controls-bar {
          position: fixed; bottom: 0; left: 0; right: 0;
          padding: 12px 24px; display: flex; justify-content: center;
          pointer-events: none; z-index: 10;
        }
        .controls-inner {
          background: rgba(0,0,0,0.25); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.06); border-radius: 14px;
          padding: 8px 18px; display: flex; gap: 16px; font-size: 12px;
          color: rgba(255,255,255,0.45); font-weight: 500;
          font-family: 'Poppins', sans-serif;
        }
        .controls-inner kbd {
          background: rgba(255,214,102,0.12); border: 1px solid rgba(255,214,102,0.25);
          border-radius: 4px; padding: 1px 6px; color: #ffd666; font-weight: 700; font-size: 11px;
        }
        @media (max-width: 768px) { .controls-inner { display: none; } }
      </style>
      <div class="hud-left">
        <div class="game-title">🪁 PATANG BAZI</div>
        <div class="hud-phase" id="hPhase"></div>
      </div>
      <div class="stats">
        <div class="stat-pill">⏱ <span class="val" id="hTime">3:00</span></div>
        <div class="stat-pill">📍 <span class="val" id="hAlt">0</span>m</div>
        <div class="stat-pill">⭐ <span class="val" id="hScore">0</span></div>
        <div class="stat-pill">💨 <span class="val" id="hWind">→</span></div>
        <button class="mute-btn" id="muteBtn">🔊</button>
      </div>
    `;
    document.body.appendChild(hud);
    this.hudEl = hud;

    // Scoreboard
    const sb = document.createElement('div');
    sb.className = 'scoreboard';
    sb.id = 'scoreboard';
    document.body.appendChild(sb);

    // Score popup
    const popup = document.createElement('div');
    popup.id = 'score-popup';
    document.body.appendChild(popup);

    // Controls
    const controls = document.createElement('div');
    controls.id = 'controls-bar';
    controls.innerHTML = `
      <div class="controls-inner">
        <span><kbd>SPACE</kbd> / <kbd>CLICK</kbd> Pull up</span>
        <span><kbd>←</kbd> <kbd>→</kbd> Steer</span>
        <span>Cross strings to cut opponents!</span>
      </div>
    `;
    document.body.appendChild(controls);

    this.hudHeight = document.getElementById('hAlt')!;
    this.hudScore = document.getElementById('hScore')!;
    this.hudWind = document.getElementById('hWind')!;
    this.hudPhase = document.getElementById('hPhase')!;
    this.hudTime = document.getElementById('hTime')!;
    this.hudPlayers = document.getElementById('scoreboard')!;
    this.muteBtn = document.getElementById('muteBtn') as HTMLButtonElement;

    // Mute toggle
    this.muteBtn.addEventListener('click', () => {
      const muted = this.sound.toggleMute();
      this.muteBtn.textContent = muted ? '🔇' : '🔊';
    });
  }

  // ========================
  // LOBBY
  // ========================

  private showLobby() {
    this.lobbyUI = new LobbyUI((name) => {
      this.playerName = name;
      // Init sound on first user interaction
      this.sound.init();
      this.connectToServer(name);
    });
  }

  private async connectToServer(name: string) {
    const url = getServerUrl();
    this.lobbyUI.setStatus(`Connecting to ${url}...`);

    try {
      this.localPlayerId = await this.network.connect(url, { name });
      this.penchRenderer.setLocalPlayer(this.localPlayerId);
      this.lobbyUI.setStatus('Connected! Waiting for players...');
      this.network.sendReady(name);
      this.watchServerState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lobbyUI.setStatus(`Failed: ${msg}`, true);
      this.lobbyUI.enableReconnect();
    }
  }

  // ========================
  // SERVER STATE WATCHING
  // ========================

  private watchServerState() {
    const room = this.network.room;
    if (!room) return;

    // Players join/leave via schema (creates/destroys views)
    room.state.players.onAdd((player: any, sessionId: string) => {
      console.log(`👤 Player added: ${player.name} (${sessionId})`);
      this.createPlayerView(sessionId, player);
      this.updateLobbyPlayers();
    });

    room.state.players.onRemove((_player: any, sessionId: string) => {
      console.log(`👤 Player removed: ${sessionId}`);
      this.removePlayerView(sessionId);
      this.updateLobbyPlayers();
    });

    // Phase changes
    room.state.listen('phase', (phase: string) => {
      console.log(`🎮 Phase: ${phase}`);
      if (phase === 'countdown') {
        this.onCountdown();
      } else if (phase === 'playing') {
        this.onGameStart();
      } else if (phase === 'finished') {
        this.onGameEnd();
      }
    });

    // Countdown ticks
    room.state.listen('countdown', (n: number) => {
      if (n > 0 && this.network.state?.phase === 'countdown') {
        this.lobbyUI.showCountdown(n);
        this.sound.playCountdownBeep(false);
      }
    });

    // --- Game event messages ---

    // Star collected
    this.network.on('starCollected', (msg: any) => {
      const pos = this.starRenderer.collectStar(msg.starId);
      if (pos) this.particleSystem.burst(pos);
      this.sound.playStarCollect();
      if (msg.playerId === this.localPlayerId) {
        this.showScorePopup(`+${STAR_POINTS} ⭐`);
        this.screenShake.light();
      }
    });

    // Pench start
    this.network.on('penchStart', (msg: any) => {
      this.penchRenderer.onPenchStart(msg.key, msg.playerAId, msg.playerBId, msg.position);
    });

    // Pench update (with sparks)
    this.network.on('penchUpdate', (msg: any) => {
      this.penchRenderer.onPenchUpdate(msg.key, msg.progress, msg.position);
      if (msg.spark) {
        this.sound.playPenchSpark();
        // Light shake during pench if local player involved
        if (msg.progress > 0.5 && this.isLocalInvolved(msg.key)) {
          this.screenShake.light();
        }
      }
    });

    // Pench end
    this.network.on('penchEnd', (msg: any) => {
      if (msg.key) this.penchRenderer.onPenchEnd(msg.key);
    });

    // Kite cut!
    this.network.on('kiteCut', (msg: any) => {
      if (msg.position) {
        this.penchRenderer.cutBurst(msg.position);
        this.particleSystem.burst(msg.position, 20);
      }
      this.sound.playKiteCut();
      this.sound.playCrowdCheer();
      this.screenShake.heavy();

      if (msg.victimId === this.localPlayerId) {
        this.showScorePopup('✂️ BO KATA!', true);
      } else if (msg.cutterId === this.localPlayerId) {
        this.showScorePopup(`🔥 +${SCORE_KITE_CUT} CUT!`);
      }
    });

    // Player joined notification (toast)
    this.network.on('playerJoined', (msg: any) => {
      // Don't show toast for self
      if (msg.playerId === this.localPlayerId) return;
      const color = PLAYER_COLORS[msg.colorIndex % PLAYER_COLORS.length];
      const action = msg.hotJoin ? 'joined the battle!' : 'joined the room';
      this.toasts.show(`${msg.name} ${action}`, color.primary);
      this.sound.playPlayerJoined();
    });

    // Player left notification
    this.network.on('playerLeft', (msg: any) => {
      if (msg.playerId === this.localPlayerId) return;
      this.toasts.show(`${msg.name} left`, undefined, 2500);
    });

    // Disconnect
    this.network.on('disconnected', () => {
      this.lobbyUI.show();
      this.lobbyUI.setStatus('Disconnected from server', true);
      this.lobbyUI.enableReconnect();
    });
  }

  /** Check if local player is involved in a pench by key */
  private isLocalInvolved(key: string): boolean {
    return !!this.localPlayerId && key.includes(this.localPlayerId);
  }

  // ========================
  // PLAYER VIEWS
  // ========================

  private createPlayerView(sessionId: string, player: any) {
    if (this.playerViews.has(sessionId)) return;
    const isLocal = sessionId === this.localPlayerId;
    const view = new PlayerView(
      this.gameLayer, sessionId, player.name || 'Player',
      player.colorIndex ?? 0, isLocal,
    );
    this.playerViews.set(sessionId, view);
  }

  private removePlayerView(sessionId: string) {
    const view = this.playerViews.get(sessionId);
    if (view) { view.destroy(); this.playerViews.delete(sessionId); }
  }

  private updateLobbyPlayers() {
    const state = this.network.state;
    if (!state) return;

    // Only update lobby if it's visible (waiting/countdown phase)
    if (state.phase === 'playing') return;

    const players: Array<{ name: string; color: string; isLocal: boolean; ready: boolean }> = [];
    state.players.forEach((p: any, id: string) => {
      const palette = PLAYER_COLORS[p.colorIndex % PLAYER_COLORS.length];
      players.push({
        name: p.name || 'Player', color: palette.primary,
        isLocal: id === this.localPlayerId, ready: p.ready,
      });
    });

    this.lobbyUI.updatePlayers(players);
    const total = players.length;
    if (total < 2) {
      this.lobbyUI.setStatus(`Waiting for opponent... (${total}/2 min)`);
    } else {
      this.lobbyUI.setStatus(`${players.filter(p => p.ready).length}/${total} ready`);
    }
  }

  // ========================
  // GAME PHASE
  // ========================

  private onCountdown() {
    // Only show countdown overlay if lobby is visible
    // (won't trigger for hot-join players since they skip lobby)
  }

  private onGameStart() {
    this.lobbyUI.hide();
    this.gameTime = 0;
    this.inputSeq = 0;
    this.inputSendAccum = 0;
    this.sound.playCountdownBeep(true);
  }

  private onGameEnd() {
    const state = this.network.state;
    if (!state) return;

    this.lobbyUI.show();
    let results = '🏆 Game Over! ';
    const sorted = Array.from(state.players.entries() as Iterable<[string, any]>)
      .sort(([, a]: [string, any], [, b]: [string, any]) => b.score - a.score);
    sorted.forEach(([id, p]: [string, any], i: number) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      const you = id === this.localPlayerId ? ' (you)' : '';
      results += `${medal} ${p.name}${you}: ${p.score}  `;
    });
    this.lobbyUI.setStatus(results);
    this.lobbyUI.enableReconnect();
  }

  // ========================
  // RENDER LOOP
  // ========================

  private startRenderLoop() {
    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS / 1000;
      this.gameTime += dt;

      // Wrap tick in try-catch so one error doesn't kill rendering
      try {
        this.tick(dt);
      } catch (e) {
        console.warn('Tick error:', e);
      }
    });
  }

  private tick(dt: number) {
    const state = this.network.state;
    const isPlaying = state?.phase === 'playing';

    // Wind (from server or safe default)
    const wind: WindState = state?.wind
      ? {
        speed: Number.isFinite(state.wind.speed) ? state.wind.speed : 1,
        direction: state.wind.direction || 1,
        changeTimer: state.wind.changeTimer || 5,
      }
      : { speed: 1, direction: 1, changeTimer: 5 };

    // --- Background (always renders) ---
    this.skyRenderer.update(this.gameTime);
    this.cloudRenderer.update(wind);
    this.birdRenderer.update(this.gameTime, dt);

    // --- Sound: wind ambience ---
    this.sound.setWindIntensity(wind.speed);

    if (!isPlaying || !state) {
      this.particleSystem.update(dt);
      this.penchRenderer.update(dt);
      this.screenShake.update(dt);
      return;
    }

    // --- Throttled input sending ---
    const currentPull = this.input.isPulling();
    const currentSteer = this.input.getSteer();

    this.inputSendAccum += dt;

    // Send input at tick rate OR immediately when input changes
    const inputChanged = currentPull !== this.lastSentPull || currentSteer !== this.lastSentSteer;

    if (this.inputSendAccum >= this.INPUT_SEND_INTERVAL || inputChanged) {
      this.inputSendAccum = 0;
      this.lastSentPull = currentPull;
      this.lastSentSteer = currentSteer;

      const input: PlayerInput = {
        seq: ++this.inputSeq,
        timestamp: this.gameTime,
        pull: currentPull,
        steer: currentSteer,
      };
      this.network.sendInput(input);
    }

    // --- Sound: tension ---
    this.sound.setTension(currentPull ? 1 : 0);

    // --- Stars ---
    const starList: StarData[] = [];
    if (state.stars) {
      state.stars.forEach((s: any) => {
        starList.push({
          id: s.id,
          position: { x: s.position.x, y: s.position.y },
          size: s.size, active: s.active,
          pulse: this.gameTime * 2,
        });
      });
    }
    this.starRenderer.syncStars(starList);
    this.starRenderer.update(this.gameTime);

    // --- Sync pench state from server schema ---
    if (state.penches) {
      state.penches.forEach((p: any) => {
        if (!p.active) return;
        // Create or update pench renderer
        this.penchRenderer.onPenchUpdate(p.id, p.progress, { x: p.position.x, y: p.position.y });
        // Start if new (idempotent)
        this.penchRenderer.onPenchStart(p.id, p.playerAId, p.playerBId, { x: p.position.x, y: p.position.y });
      });
    }

    // --- Render players ---
    state.players.forEach((player: any, sessionId: string) => {
      const view = this.playerViews.get(sessionId);
      if (!view) return;

      const kite: KiteState = {
        position: { x: player.kite.position.x, y: player.kite.position.y },
        velocity: { x: player.kite.velocity.x, y: player.kite.velocity.y },
        angle: player.kite.angle,
        tailPhase: player.kite.tailPhase,
        alive: player.kite.alive,
      };
      const anchor = { x: player.anchorPosition.x, y: player.anchorPosition.y };
      const isLocal = sessionId === this.localPlayerId;

      if (isLocal) {
        // Client-side prediction for smooth local movement
        const pending = this.network.getPendingInputs(player.lastProcessedInput);
        let predicted = { ...kite };
        for (const pi of pending) {
          const result = stepKite(predicted, anchor, pi, wind, [], this.gameTime, FIXED_DT);
          predicted = result.kite;
        }
        view.update(predicted, anchor, wind, currentPull, this.gameTime);
      } else {
        view.update(kite, anchor, wind, false, this.gameTime);
      }

      view.setName(player.name || 'Player');
    });

    // --- Effects ---
    this.penchRenderer.update(dt);
    this.particleSystem.update(dt);
    this.screenShake.update(dt);

    // --- HUD ---
    this.updateHUD(state, wind);
  }

  // ========================
  // HUD
  // ========================

  private updateHUD(state: any, wind: WindState) {
    const localPlayer = state.players.get(this.localPlayerId);

    if (localPlayer) {
      const heightM = Math.max(0, Math.round(
        (localPlayer.anchorPosition.y - localPlayer.kite.position.y) / (WORLD_HEIGHT * 0.008)
      ));
      this.hudHeight.textContent = String(heightM);
      this.hudScore.textContent = String(localPlayer.score);
    }

    // Wind
    const arrow = wind.direction > 0 ? '→' : '←';
    this.hudWind.textContent = wind.speed < 0.5 ? 'Calm' : wind.speed < 1 ? `${arrow} Light` : `${arrow} Strong`;

    // Time
    const secs = Math.max(0, Math.ceil(state.timeRemaining));
    this.hudTime.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    // Phase
    this.hudPhase.textContent = state.phase === 'playing'
      ? `Room: ${this.network.roomId?.slice(0, 6)} · ${state.players.size} players`
      : state.phase;

    // Scoreboard
    const rows: string[] = [];
    const sorted = Array.from(state.players.entries() as Iterable<[string, any]>)
      .sort(([, a]: [string, any], [, b]: [string, any]) => b.score - a.score);
    for (const [id, p] of sorted) {
      const palette = PLAYER_COLORS[p.colorIndex % PLAYER_COLORS.length];
      const isLocal = id === this.localPlayerId;
      const isDead = !p.kite.alive;
      rows.push(`
        <div class="sb-row${isLocal ? ' local' : ''}${isDead ? ' dead' : ''}">
          <div class="sb-dot" style="background:${palette.primary}"></div>
          <span class="sb-name">${p.name || 'Player'}${isDead ? ' ✂️' : ''}</span>
          <span class="sb-score">${p.score}</span>
        </div>
      `);
    }
    this.hudPlayers.innerHTML = rows.join('');
  }

  // ========================
  // UTILS
  // ========================

  private scorePopupTimer = 0;

  private showScorePopup(text: string, isCut = false) {
    const el = document.getElementById('score-popup')!;
    el.textContent = text;
    el.className = 'show' + (isCut ? ' cut' : '');
    clearTimeout(this.scorePopupTimer as unknown as number);
    this.scorePopupTimer = window.setTimeout(() => {
      el.className = '';
    }, 1500);
  }

  onResize(screenW: number, screenH: number) {
    const scaleX = screenW / WORLD_WIDTH;
    const scaleY = screenH / WORLD_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    const baseX = (screenW - WORLD_WIDTH * scale) / 2;
    const baseY = (screenH - WORLD_HEIGHT * scale) / 2;

    this.worldContainer.scale.set(scale);
    this.screenShake.saveBase(baseX, baseY);
    this.worldContainer.position.set(baseX, baseY);
  }
}
