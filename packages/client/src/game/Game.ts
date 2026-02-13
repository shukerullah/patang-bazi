// ============================================
// PATANG BAZI — Game Core (Multiplayer)
// Camera follow, responsive fill-scale,
// hot-join, toasts, pench, sound, shake
// ============================================

import { Application, Container } from 'pixi.js';
import { InputManager } from '../systems/InputManager';
import { NetworkManager } from '../network/NetworkManager';
import { Camera } from '../systems/Camera';
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
  FIXED_DT,
  SERVER_SEND_RATE,
  KITE_MAX_LINE_LENGTH,
  PLAYER_COLORS,
  STAR_POINTS,
  SCORE_KITE_CUT,
  GAME_VERSION,
  stepKite,
  type PlayerInput,
  type KiteState,
  type WindState,
  type GameOverMessage,
} from '@patang/shared';

function getServerUrl(): string {
  // Production: set VITE_SERVER_URL env var at build time
  // e.g., VITE_SERVER_URL=wss://patang-server.onrender.com
  const envUrl = (import.meta as any).env?.VITE_SERVER_URL;
  if (envUrl) return envUrl;

  // Development: same hostname, server port 2567
  const host = window.location.hostname;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${host}:2567`;
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
      dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: ${colorDot};`;
      el.appendChild(dot);
    }

    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);

    this.container.appendChild(el);
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
  private camera: Camera;

  // Scene layers
  private bgContainer!: Container;    // Screen space (sky gradient + sun)
  private worldContainer!: Container; // Camera-controlled (world objects)
  private cloudLayer!: Container;
  private groundLayer!: Container;
  private gameLayer!: Container;
  private effectLayer!: Container;

  // Renderers
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

  // Current local kite position (for camera)
  private localKiteX = WORLD_WIDTH / 2;
  private localKiteY = WORLD_HEIGHT * 0.5;
  private cameraInitialized = false;

  // Timing
  private gameTime = 0;
  private inputSeq = 0;
  private inputSendAccum = 0;        // Accumulator for throttled input sending
  private readonly INPUT_SEND_INTERVAL = 1 / SERVER_SEND_RATE;  // Send at server's receive rate (20fps)

  // Track last input to avoid redundant sends
  private lastSentPull = false;
  private lastSentSteer = 0;

  // UI
  private lobbyUI!: LobbyUI;
  private toasts!: ToastManager;
  public hudEl: HTMLDivElement | null = null;

  // HUD refs
  private hudWind!: HTMLElement;
  private hudPhase!: HTMLElement;
  private hudPing!: HTMLElement;
  private hudTime!: HTMLElement;
  private hudPlayers!: HTMLElement;
  private muteBtn!: HTMLButtonElement;
  private hudManjhaFill!: HTMLElement;
  private hudManjhaPct!: HTMLElement;
  private hudManjhaBar!: HTMLElement;
  private hudUpdateAccum = 0;
  private lastScoreboardHtml = '';
  private pendingGameOver: GameOverMessage | null = null;

  constructor(app: Application, input: InputManager, network: NetworkManager) {
    this.app = app;
    this.input = input;
    this.network = network;
    this.camera = new Camera();
  }

  async init() {
    this.sound = new SoundManager();
    this.toasts = new ToastManager();
    this.screenShake = new ScreenShake();
    this.setupSceneGraph();
    this.setupRenderers();
    this.setupHUD();
    this.showLobby();
    this.startRenderLoop();
  }

  // ========================
  // SCENE GRAPH
  // ========================

  private setupSceneGraph() {
    // BG container: screen-space (never scaled/moved by camera)
    // Sky gradient + sun + bg stars render here in screen pixels
    this.bgContainer = new Container();
    this.app.stage.addChild(this.bgContainer);

    // World container: camera-controlled
    // Everything in world coordinates renders here
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.cloudLayer = new Container();
    this.groundLayer = new Container();
    this.gameLayer = new Container();
    this.effectLayer = new Container();

    this.worldContainer.addChild(
      this.cloudLayer,
      this.groundLayer,
      this.gameLayer,
      this.effectLayer,
    );

    this.onResize(window.innerWidth, window.innerHeight);
  }

  private setupRenderers() {
    // Sky renders into bgContainer (screen space)
    this.skyRenderer = new SkyRenderer(this.bgContainer);
    // Ground in world space
    new GroundRenderer(this.groundLayer);
    // Clouds + birds in world space
    this.cloudRenderer = new CloudRenderer(this.cloudLayer);
    this.birdRenderer = new BirdRenderer(this.cloudLayer);
    // Game objects
    this.starRenderer = new StarRenderer(this.gameLayer);
    this.penchRenderer = new PenchRenderer(this.effectLayer);
    this.particleSystem = new ParticleSystem(this.effectLayer);
  }

  // ========================
  // RESPONSIVE HUD
  // ========================

  private setupHUD() {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <style>
        /* === TOP BAR: title left, stats right === */
        #hud {
          position: fixed; top: 0; left: 0; right: 0;
          padding: 12px 16px;
          display: flex; justify-content: space-between; align-items: flex-start;
          pointer-events: none; z-index: 10;
          font-family: 'Poppins', sans-serif;
        }
        .game-title {
          font-family: 'Baloo 2', cursive; font-size: 22px; font-weight: 800; color: #fff;
          text-shadow: 0 2px 20px rgba(255,150,50,0.4); line-height: 1;
          white-space: nowrap; flex-shrink: 0;
        }
        .stats {
          display: flex; gap: 6px; flex-wrap: nowrap;
          align-items: center;
        }
        .stat-pill {
          background: rgba(0,0,0,0.35); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
          padding: 3px 10px; font-size: 11px; font-weight: 500;
          color: rgba(255,255,255,0.7); display: flex; align-items: center; gap: 4px;
          white-space: nowrap;
        }
        .stat-pill .val {
          color: #ffd666; font-weight: 700; font-size: 12px;
          display: inline-block; text-align: right;
        }
        .val-time { min-width: 30px; }
        .val-wind { min-width: 52px; }
        .mute-btn {
          background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 50%; width: 30px; height: 30px;
          font-size: 14px; cursor: pointer; pointer-events: auto;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.7); transition: background 0.2s;
        }
        .mute-btn:hover { background: rgba(255,255,255,0.1); }

        /* === BOTTOM-LEFT: room info only === */
        #hud-bottom-left {
          position: fixed; bottom: 12px; left: 16px;
          pointer-events: none; z-index: 10;
          font-family: 'Poppins', sans-serif;
          display: flex; flex-direction: column; gap: 2px;
        }
        .hud-phase {
          font-size: 10px; color: rgba(255,255,255,0.35); font-weight: 500;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .hud-ping {
          font-size: 9px; font-weight: 600; font-family: 'Poppins', monospace;
          color: rgba(255,255,255,0.3);
        }
        .hud-ping.good { color: rgba(100,220,100,0.5); }
        .hud-ping.ok { color: rgba(255,214,102,0.5); }
        .hud-ping.bad { color: rgba(255,100,100,0.5); }
        .game-version {
          font-size: 9px; color: rgba(255,255,255,0.2); font-weight: 400;
          letter-spacing: 0.5px;
        }

        /* Score popup */
        #score-popup {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          z-index: 20; pointer-events: none;
          font-family: 'Baloo 2', cursive; font-size: 42px; font-weight: 800;
          color: #ffd666; text-shadow: 0 4px 30px rgba(255,180,50,0.6);
          opacity: 0; transition: opacity 0.3s, transform 0.3s;
        }
        #score-popup.show { opacity: 1; transform: translate(-50%, -60%); }
        #score-popup.cut { color: #ff4444; text-shadow: 0 4px 30px rgba(255,50,50,0.6); }

        /* Scoreboard */
        .scoreboard {
          position: fixed; top: 48px; right: 12px; z-index: 10; pointer-events: none;
          display: flex; flex-direction: column; gap: 3px;
        }
        .sb-row {
          background: rgba(0,0,0,0.3); backdrop-filter: blur(8px);
          border-radius: 8px; padding: 3px 10px; font-size: 11px;
          color: rgba(255,255,255,0.8); display: flex; align-items: center; gap: 6px;
          border: 1px solid rgba(255,255,255,0.06);
          font-family: 'Poppins', sans-serif;
        }
        .sb-row.local { border-color: rgba(255,214,102,0.3); }
        .sb-row.dead { opacity: 0.4; }
        .sb-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .sb-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; }
        .sb-score { color: #ffd666; font-weight: 700; }

        /* Controls bar */
        #controls-bar {
          position: fixed; bottom: 0; left: 0; right: 0;
          padding: 10px 16px; display: flex; justify-content: center;
          pointer-events: none; z-index: 10;
        }
        .controls-inner {
          background: rgba(0,0,0,0.25); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.06); border-radius: 14px;
          padding: 6px 16px; display: flex; gap: 14px; font-size: 11px;
          color: rgba(255,255,255,0.45); font-weight: 500;
          font-family: 'Poppins', sans-serif;
        }
        .controls-inner kbd {
          background: rgba(255,214,102,0.12); border: 1px solid rgba(255,214,102,0.25);
          border-radius: 4px; padding: 1px 5px; color: #ffd666; font-weight: 700; font-size: 10px;
        }
        .controls-mobile { display: none; }

        /* === MANJHA (string) length bar === */
        #manjha-bar {
          position: fixed; left: 14px; top: 50%; transform: translateY(-50%);
          z-index: 10; pointer-events: none;
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          font-family: 'Poppins', sans-serif;
        }
        .manjha-label {
          font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.4);
          letter-spacing: 0.5px; text-transform: uppercase;
          writing-mode: vertical-rl; text-orientation: mixed;
        }
        .manjha-track {
          width: 6px; height: 120px; border-radius: 3px;
          background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08);
          position: relative; overflow: hidden;
          backdrop-filter: blur(8px);
        }
        .manjha-fill {
          position: absolute; bottom: 0; left: 0; right: 0;
          border-radius: 3px;
          background: rgba(255,255,255,0.5);
          transition: height 0.1s ease-out, background 0.3s ease;
        }
        .manjha-pct {
          font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.45);
          min-width: 24px; text-align: center;
        }

        /* ====== MOBILE ====== */
        @media (max-width: 600px) {
          #hud { padding: 8px 10px; }
          .game-title { font-size: 16px; }
          .stat-pill { padding: 2px 8px; font-size: 10px; gap: 3px; }
          .stat-pill .val { font-size: 10px; }
          .val-time { min-width: 26px; }
          .val-wind { min-width: 44px; }
          .mute-btn { width: 26px; height: 26px; font-size: 12px; }
          .scoreboard { top: 40px; right: 8px; }
          .sb-row { padding: 2px 8px; font-size: 10px; }
          .sb-name { max-width: 60px; }
          #score-popup { font-size: 32px; }
          .controls-desktop { display: none; }
          .controls-mobile { display: flex; }
          #toast-container { top: 42px; left: 8px; }
          #hud-bottom-left { bottom: 8px; left: 10px; }
          .hud-phase { font-size: 9px; }
          .hud-ping { font-size: 8px; }
          .game-version { font-size: 8px; }
          #manjha-bar { left: 6px; }
          .manjha-track { height: 90px; width: 5px; }
          .manjha-label { font-size: 8px; }
          .manjha-pct { font-size: 8px; }
        }

        @media (max-width: 400px) {
          .game-title { font-size: 14px; }
          .stat-pill { padding: 2px 6px; font-size: 9px; border-radius: 14px; }
          .stats { gap: 4px; }
        }
      </style>
      <div class="game-title">🪁 PATANG BAZI</div>
      <div class="stats">
        <div class="stat-pill">⏱ <span class="val val-time" id="hTime">3:00</span></div>
        <div class="stat-pill">💨 <span class="val val-wind" id="hWind">→</span></div>
        <button class="mute-btn" id="muteBtn">🔊</button>
      </div>
    `;
    document.body.appendChild(hud);
    this.hudEl = hud;

    // Bottom-left: room info + version (NOT title — title is top-left now)
    const bottomLeft = document.createElement('div');
    bottomLeft.id = 'hud-bottom-left';
    bottomLeft.innerHTML = `
      <div class="hud-phase" id="hPhase"></div>
      <div class="hud-ping" id="hPing"></div>
      <div class="game-version">v${GAME_VERSION}</div>
    `;
    document.body.appendChild(bottomLeft);

    const sb = document.createElement('div');
    sb.className = 'scoreboard';
    sb.id = 'scoreboard';
    document.body.appendChild(sb);

    // Score popup
    const popup = document.createElement('div');
    popup.id = 'score-popup';
    document.body.appendChild(popup);

    // Controls — desktop + mobile variants
    const controls = document.createElement('div');
    controls.id = 'controls-bar';
    controls.innerHTML = `
      <div class="controls-inner controls-desktop">
        <span><kbd>SPACE</kbd> / <kbd>CLICK</kbd> Pull up</span>
        <span><kbd>←</kbd> <kbd>→</kbd> Steer</span>
        <span>Cross strings to cut opponents!</span>
      </div>
      <div class="controls-inner controls-mobile">
        <span>Touch to pull up</span>
        <span>👈 Left · Right 👉 to steer</span>
        <span>Cross strings to cut!</span>
      </div>
    `;
    document.body.appendChild(controls);

    // Manjha (string length) bar — center left
    const manjhaBar = document.createElement('div');
    manjhaBar.id = 'manjha-bar';
    manjhaBar.innerHTML = `
      <div class="manjha-label">🧵</div>
      <div class="manjha-track">
        <div class="manjha-fill" id="manjhaFill"></div>
      </div>
      <div class="manjha-pct" id="manjhaPct">0%</div>
    `;
    document.body.appendChild(manjhaBar);

    this.hudWind = document.getElementById('hWind')!;
    this.hudPhase = document.getElementById('hPhase')!;
    this.hudPing = document.getElementById('hPing')!;
    this.hudTime = document.getElementById('hTime')!;
    this.hudPlayers = document.getElementById('scoreboard')!;
    this.muteBtn = document.getElementById('muteBtn') as HTMLButtonElement;
    this.hudManjhaFill = document.getElementById('manjhaFill')!;
    this.hudManjhaPct = document.getElementById('manjhaPct')!;
    this.hudManjhaBar = document.getElementById('manjha-bar')!;

    // Hide manjha bar until game starts
    this.hudManjhaBar.style.display = 'none';

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
      this.sound.init();
      this.connectToServer(name);
    });
  }

  private async connectToServer(name: string) {
    const url = getServerUrl();

    // Show loading spinner (Render cold starts can take 30-60s)
    this.lobbyUI.showLoading('Connecting to server...');
    this.lobbyUI.setStatus('');

    // Progressive loading messages for slow connections
    const loadingTimer = setTimeout(() => {
      this.lobbyUI.showLoading('Server is waking up... hang tight!');
    }, 5000);

    const loadingTimer2 = setTimeout(() => {
      this.lobbyUI.showLoading('Almost there... first connection takes a moment');
    }, 15000);

    try {
      this.localPlayerId = await this.network.connect(url, { name });
      clearTimeout(loadingTimer);
      clearTimeout(loadingTimer2);

      this.lobbyUI.hideLoading();
      this.penchRenderer.setLocalPlayer(this.localPlayerId);
      this.lobbyUI.setStatus('Connected! Waiting for players...');
      this.network.sendReady(name);
      this.watchServerState();
    } catch (err) {
      clearTimeout(loadingTimer);
      clearTimeout(loadingTimer2);

      this.lobbyUI.hideLoading();

      let msg = 'Unknown error';
      if (err instanceof Error) {
        msg = err.message;
      } else if (typeof err === 'object' && err !== null && 'type' in err && (err as any).type === 'error') {
        // WebSocket connection error often comes as an Event/ProgressEvent
        msg = 'Could not reach server';
      } else {
        msg = String(err);
      }

      console.error('Connection error:', err);
      this.lobbyUI.showError(`Connection failed: ${msg}`);
    }
  }

  // ========================
  // SERVER STATE WATCHING
  // ========================

  private watchServerState() {
    const room = this.network.room;
    if (!room) return;

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

    room.state.listen('phase', (phase: string) => {
      console.log(`🎮 Phase: ${phase}`);
      if (phase === 'countdown') this.onCountdown();
      else if (phase === 'playing') this.onGameStart();
      else if (phase === 'finished') this.onGameEnd();
    });

    room.state.listen('countdown', (n: number) => {
      if (n > 0 && this.network.state?.phase === 'countdown') {
        this.lobbyUI.showCountdown(n);
        this.sound.playCountdownBeep(false);
      }
    });

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

    // Pench
    this.network.on('penchStart', (msg: any) => {
      this.penchRenderer.ensurePench(msg.key, msg.playerAId, msg.playerBId, msg.position, '');
    });

    this.network.on('penchUpdate', (msg: any) => {
      this.penchRenderer.syncProgress(msg.key, msg.progress, msg.position, msg.winnerId);
      if (msg.spark) {
        this.sound.playPenchSpark();
        if (msg.progress > 0.5 && this.isLocalInvolved(msg.key)) {
          this.screenShake.light();
        }
      }
    });

    this.network.on('penchEnd', (msg: any) => {
      if (msg.key) this.penchRenderer.removePench(msg.key);
    });

    // Kite cut
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

    // Player join/leave toasts
    this.network.on('playerJoined', (msg: any) => {
      if (msg.playerId === this.localPlayerId) return;
      const color = PLAYER_COLORS[msg.colorIndex % PLAYER_COLORS.length];
      const action = msg.hotJoin ? 'joined the battle!' : 'joined the room';
      this.toasts.show(`${msg.name} ${action}`, color.primary);
      this.sound.playPlayerJoined();
    });

    this.network.on('playerLeft', (msg: any) => {
      if (msg.playerId === this.localPlayerId) return;
      this.toasts.show(`${msg.name} left`, undefined, 2500);
    });

    // Game over — capture rankings from server message (includes bots)
    this.network.on('gameOver', (msg: GameOverMessage) => {
      this.pendingGameOver = msg;
    });

    this.network.on('disconnected', () => {
      this.cleanupGameState();
      this.lobbyUI.showError('Disconnected from server');
    });
  }

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
    if (!state || state.phase === 'playing') return;

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

  private onCountdown() { /* countdown overlay handled by lobby listener */ }

  private onGameStart() {
    this.lobbyUI.hide();
    this.gameTime = 0;
    this.inputSeq = 0;
    this.inputSendAccum = 0;
    this.cameraInitialized = false;
    this.sound.playCountdownBeep(true);
    this.hudManjhaBar.style.display = '';
  }

  private onGameEnd() {
    // Use rankings from GAME_OVER message (built BEFORE bots are removed)
    const msg = this.pendingGameOver;
    if (!msg || !msg.rankings) {
      // Fallback: read from state (may miss bots if already removed)
      const state = this.network.state;
      if (!state) return;
      const fallbackPlayers: Array<{
        name: string; score: number; color: string;
        isLocal: boolean; cuts: number;
      }> = [];
      for (const [id, p] of state.players.entries() as Iterable<[string, any]>) {
        const palette = PLAYER_COLORS[p.colorIndex % PLAYER_COLORS.length];
        fallbackPlayers.push({
          name: p.name || 'Player',
          score: p.score,
          color: palette.primary,
          isLocal: id === this.localPlayerId,
          cuts: p.cuts ?? 0,
        });
      }
      this.lobbyUI.showResults(fallbackPlayers);
    } else {
      // Primary path: use server-sent rankings (includes ALL players incl. bots)
      const players = msg.rankings.map(r => {
        const palette = PLAYER_COLORS[r.colorIndex % PLAYER_COLORS.length];
        return {
          name: r.name,
          score: r.score,
          color: palette.primary,
          isLocal: r.playerId === this.localPlayerId,
          cuts: r.kiteCuts ?? 0,
        };
      });
      this.lobbyUI.showResults(players);
    }

    this.pendingGameOver = null;

    // Wire up "Play Again" → disconnect, cleanup, show lobby
    this.lobbyUI.onPlayAgain(async () => {
      await this.network.disconnect();
      this.cleanupGameState();
      this.lobbyUI.reset();
    });
  }

  /** Clean up all game state between sessions */
  private cleanupGameState() {
    // Destroy all player views
    for (const [, view] of this.playerViews) {
      view.destroy();
    }
    this.playerViews.clear();

    // Clear network event listeners (prevents duplicate watchers)
    this.network.removeAllListeners();

    // Reset game state
    this.localPlayerId = null;
    this.pendingGameOver = null;
    this.gameTime = 0;
    this.inputSeq = 0;
    this.inputSendAccum = 0;
    this.lastSentPull = false;
    this.lastSentSteer = 0;
    this.cameraInitialized = false;
    this.hudManjhaBar.style.display = 'none';
  }

  // ========================
  // RENDER LOOP
  // ========================

  private startRenderLoop() {
    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS / 1000;
      this.gameTime += dt;
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

    // Wind
    const wind: WindState = state?.wind
      ? {
        speed: Number.isFinite(state.wind.speed) ? state.wind.speed : 1,
        direction: state.wind.direction || 1,
        changeTimer: state.wind.changeTimer || 5,
      }
      : { speed: 1, direction: 1, changeTimer: 5 };

    // --- Camera: follow local kite or default center ---
    if (isPlaying && state) {
      const localPlayer = state.players.get(this.localPlayerId);
      if (localPlayer && localPlayer.kite.alive) {
        this.localKiteX = localPlayer.kite.position.x;
        this.localKiteY = localPlayer.kite.position.y;
      }

      if (!this.cameraInitialized) {
        this.camera.snapTo(this.localKiteX, this.localKiteY);
        this.cameraInitialized = true;
      } else {
        this.camera.follow(this.localKiteX, this.localKiteY, dt);
      }
    } else {
      // Lobby: gentle drift at world center
      const idleX = WORLD_WIDTH / 2 + Math.sin(this.gameTime * 0.2) * 50;
      const idleY = WORLD_HEIGHT * 0.45 + Math.sin(this.gameTime * 0.15) * 20;
      this.camera.follow(idleX, idleY, dt);
    }

    // --- Screen shake ---
    this.screenShake.update(dt);

    // --- Apply camera to world container ---
    const cam = this.camera.getWorldTranslation();
    this.worldContainer.scale.set(this.camera.scale);
    this.worldContainer.position.set(
      cam.x + this.screenShake.offsetX,
      cam.y + this.screenShake.offsetY,
    );

    // --- Background (screen space, always) ---
    this.skyRenderer.update(this.gameTime, this.camera);

    // --- World-space background ---
    this.cloudRenderer.update(wind);
    this.birdRenderer.update(this.gameTime, dt);

    // --- Sound: wind ---
    this.sound.setWindIntensity(wind.speed);

    if (!isPlaying || !state) {
      this.particleSystem.update(dt);
      this.penchRenderer.update(dt);
      return;
    }

    // --- Throttled input ---
    const currentPull = this.input.isPulling();
    const currentSteer = this.input.getSteer();
    this.inputSendAccum += dt;
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
        });
      });
    }
    this.starRenderer.syncStars(starList);
    this.starRenderer.update(this.gameTime, dt);

    // --- Pench schema sync ---
    if (state.penches) {
      const activeSchemaKeys = new Set<string>();
      state.penches.forEach((p: any) => {
        if (!p.active) return;
        activeSchemaKeys.add(p.id);
        // Ensure pench exists without resetting progress
        this.penchRenderer.ensurePench(
          p.id, p.playerAId, p.playerBId,
          { x: p.position.x, y: p.position.y }, p.winnerId,
        );
        // Sync actual progress value
        this.penchRenderer.syncProgress(
          p.id, p.progress,
          { x: p.position.x, y: p.position.y }, p.winnerId,
        );
      });

      // Remove penches no longer in schema (except cut burst effects)
      for (const key of this.penchRenderer.getActiveKeys()) {
        if (key === '__cut_burst__') continue;
        if (!activeSchemaKeys.has(key)) {
          this.penchRenderer.removePench(key);
        }
      }
    }

    // --- Render players ---
    state.players.forEach((player: any, sessionId: string) => {
      const view = this.playerViews.get(sessionId);
      if (!view) return;

      // Fade disconnected players (they'll be removed by server after timeout)
      const targetAlpha = !player.connected ? 0.25
        : sessionId === this.localPlayerId ? 1.0 : 0.85;
      view.container.alpha += (targetAlpha - view.container.alpha) * 0.1;

      const kite: KiteState = {
        position: { x: player.kite.position.x, y: player.kite.position.y },
        velocity: { x: player.kite.velocity.x, y: player.kite.velocity.y },
        angle: player.kite.angle,
        tailPhase: player.kite.tailPhase,
        alive: player.kite.alive,
      };
      const anchor = { x: player.anchorPosition.x, y: player.anchorPosition.y };
      const isLocal = sessionId === this.localPlayerId;

      if (isLocal && player.connected) {
        // Measure ping from input ack (client-side only, zero server cost)
        this.network.updatePing(player.lastProcessedInput);
        const pending = this.network.getPendingInputs(player.lastProcessedInput);
        let predicted = { ...kite };
        for (const pi of pending) {
          const result = stepKite(predicted, anchor, pi, wind, [], this.gameTime, FIXED_DT);
          predicted = result.kite;
        }
        view.update(predicted, anchor, wind, currentPull, this.gameTime);

        // Update camera target from predicted position
        this.localKiteX = predicted.position.x;
        this.localKiteY = predicted.position.y;
      } else {
        view.update(kite, anchor, wind, false, this.gameTime);
      }

      view.setName(player.name || 'Player');
    });

    // --- Effects ---
    this.penchRenderer.update(dt);
    this.particleSystem.update(dt);

    // --- HUD ---
    this.updateHUD(state, wind, dt);
  }

  // ========================
  // HUD
  // ========================

  private updateHUD(state: any, wind: WindState, dt: number) {
    const localPlayer = state.players.get(this.localPlayerId);

    // Cheap textContent updates — safe every frame
    if (localPlayer) {
      // Manjha (string) length bar
      const dx = localPlayer.kite.position.x - localPlayer.anchorPosition.x;
      const dy = localPlayer.kite.position.y - localPlayer.anchorPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = Math.min(1, dist / KITE_MAX_LINE_LENGTH);
      const pct = Math.round(ratio * 100);

      this.hudManjhaFill.style.height = `${pct}%`;
      this.hudManjhaPct.textContent = `${pct}%`;

      // Color: white → yellow → orange → red as it nears max
      let manjhaColor: string;
      if (ratio < 0.6) {
        manjhaColor = 'rgba(255,255,255,0.5)';
      } else if (ratio < 0.8) {
        manjhaColor = '#ffd666';
      } else if (ratio < 0.92) {
        manjhaColor = '#ff8833';
      } else {
        manjhaColor = '#ff4444';
      }
      this.hudManjhaFill.style.background = manjhaColor;
      this.hudManjhaPct.style.color = ratio >= 0.6 ? manjhaColor : 'rgba(255,255,255,0.45)';
    }

    const secs = Math.max(0, Math.ceil(state.timeRemaining));
    this.hudTime.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    // Throttle expensive updates (~4fps)
    this.hudUpdateAccum += dt;
    if (this.hudUpdateAccum < 0.25) return;
    this.hudUpdateAccum = 0;

    const arrow = wind.direction > 0 ? '→' : '←';
    this.hudWind.textContent = wind.speed < 0.5 ? 'Calm' : wind.speed < 1 ? `${arrow} Light` : `${arrow} Strong`;

    // Ping display (client-side measurement)
    const ping = this.network.ping;
    if (ping > 0) {
      this.hudPing.textContent = `${ping}ms`;
      this.hudPing.className = ping < 80 ? 'hud-ping good' : ping < 150 ? 'hud-ping ok' : 'hud-ping bad';
    }

    this.hudPhase.textContent = state.phase === 'playing'
      ? `Room: ${this.network.roomId?.slice(0, 6)} · ${state.players.size} players`
      : state.phase;

    // Scoreboard — only rewrite DOM when content changes
    const rows: string[] = [];
    const sorted = Array.from(state.players.entries() as Iterable<[string, any]>)
      .sort(([, a]: [string, any], [, b]: [string, any]) => b.score - a.score);
    for (const [id, p] of sorted) {
      const palette = PLAYER_COLORS[p.colorIndex % PLAYER_COLORS.length];
      const isLocal = id === this.localPlayerId;
      const isDead = !p.kite.alive;
      // Escape HTML in player name (defense-in-depth, server also sanitizes)
      const safeName = (p.name || 'Player').replace(/[<>&"']/g, (c: string) =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] || c
      );
      rows.push(`
        <div class="sb-row${isLocal ? ' local' : ''}${isDead ? ' dead' : ''}">
          <div class="sb-dot" style="background:${palette.primary}"></div>
          <span class="sb-name">${safeName}${isDead ? ' ✂️' : ''}</span>
          <span class="sb-score">${p.score}</span>
        </div>
      `);
    }
    const html = rows.join('');
    if (html !== this.lastScoreboardHtml) {
      this.lastScoreboardHtml = html;
      this.hudPlayers.innerHTML = html;
    }
  }

  // ========================
  // UTILS
  // ========================

  private scorePopupTimer: ReturnType<typeof setTimeout> | null = null;

  private showScorePopup(text: string, isCut = false) {
    const el = document.getElementById('score-popup')!;
    el.textContent = text;
    el.className = 'show' + (isCut ? ' cut' : '');
    if (this.scorePopupTimer) clearTimeout(this.scorePopupTimer);
    this.scorePopupTimer = setTimeout(() => {
      el.className = '';
    }, 1500);
  }

  onResize(screenW: number, screenH: number) {
    this.camera.setViewport(screenW, screenH);

    if (this.skyRenderer) {
      this.skyRenderer.setScreenSize(screenW, screenH);
    }
  }
}
