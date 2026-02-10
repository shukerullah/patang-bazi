// ============================================
// PATANG BAZI — Game Core (Multiplayer)
// Server-authoritative with visual renderers
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
import { LobbyUI } from '../ui/LobbyUI';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  FIXED_DT,
  PLAYER_COLORS,
  STAR_POINTS,
  stepKite,
  type PlayerInput,
  type KiteState,
  type WindState,
} from '@patang/shared';

// Server URL — auto-detect from page host
function getServerUrl(): string {
  const host = window.location.hostname;
  const port = 2567;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${host}:${port}`;
}

export class Game {
  private app: Application;
  private input: InputManager;
  private network: NetworkManager;

  // Scene layers
  private worldContainer!: Container;
  private skyLayer!: Container;
  private cloudLayer!: Container;
  private gameLayer!: Container;
  private effectLayer!: Container;

  // Background renderers
  private skyRenderer!: SkyRenderer;
  private cloudRenderer!: CloudRenderer;
  private birdRenderer!: BirdRenderer;
  private starRenderer!: StarRenderer;
  private particleSystem!: ParticleSystem;

  // Per-player views (created/destroyed dynamically)
  private playerViews = new Map<string, PlayerView>();
  private localPlayerId: string | null = null;
  public playerName = 'Player';

  // Game time
  private gameTime = 0;
  private inputSeq = 0;

  // Client-side prediction state for local player

  // UI
  private lobbyUI!: LobbyUI;
  public hudEl: HTMLDivElement | null = null;

  // HUD refs
  private hudHeight!: HTMLElement;
  private hudScore!: HTMLElement;
  private hudWind!: HTMLElement;
  private hudPlayers!: HTMLElement;
  private hudPhase!: HTMLElement;
  private hudTime!: HTMLElement;

  constructor(app: Application, input: InputManager, network: NetworkManager) {
    this.app = app;
    this.input = input;
    this.network = network;
  }

  async init() {
    this.setupSceneGraph();
    this.setupRenderers();
    this.setupHUD();
    this.setupNetworkEvents();
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

    this.worldContainer.addChild(
      this.skyLayer,
      this.cloudLayer,
      this.gameLayer,
      this.effectLayer,
    );

    this.onResize(window.innerWidth, window.innerHeight);
  }

  private setupRenderers() {
    this.skyRenderer = new SkyRenderer(this.skyLayer, WORLD_WIDTH, WORLD_HEIGHT);
    this.cloudRenderer = new CloudRenderer(this.cloudLayer);
    this.birdRenderer = new BirdRenderer(this.cloudLayer);
    new GroundRenderer(this.skyLayer);
    this.starRenderer = new StarRenderer(this.gameLayer);
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
        .hud-phase {
          font-size: 12px; color: rgba(255,255,255,0.4); font-weight: 500;
        }
        .stats { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .stat-pill {
          background: rgba(0,0,0,0.35); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
          padding: 4px 12px; font-size: 12px; font-weight: 500;
          color: rgba(255,255,255,0.7); display: flex; align-items: center; gap: 5px;
        }
        .stat-pill .val { color: #ffd666; font-weight: 700; font-size: 13px; }
        #score-popup {
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          z-index: 20; pointer-events: none;
          font-family: 'Baloo 2', cursive; font-size: 48px; font-weight: 800;
          color: #ffd666; text-shadow: 0 4px 30px rgba(255,180,50,0.6);
          opacity: 0; transition: opacity 0.3s, transform 0.3s;
        }
        #score-popup.show { opacity: 1; transform: translate(-50%, -60%); }
        .scoreboard {
          position: fixed; top: 50px; right: 16px; z-index: 10; pointer-events: none;
          display: flex; flex-direction: column; gap: 4px;
        }
        .sb-row {
          background: rgba(0,0,0,0.3); backdrop-filter: blur(8px);
          border-radius: 8px; padding: 4px 12px; font-size: 12px;
          color: rgba(255,255,255,0.8); display: flex; align-items: center; gap: 8px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .sb-row.local { border-color: rgba(255,214,102,0.3); }
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
      </div>
    `;
    document.body.appendChild(hud);
    this.hudEl = hud;

    // Scoreboard container
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
        <span>Release to glide</span>
      </div>
    `;
    document.body.appendChild(controls);

    this.hudHeight = document.getElementById('hAlt')!;
    this.hudScore = document.getElementById('hScore')!;
    this.hudWind = document.getElementById('hWind')!;
    this.hudPhase = document.getElementById('hPhase')!;
    this.hudTime = document.getElementById('hTime')!;
    this.hudPlayers = document.getElementById('scoreboard')!;
  }

  // ========================
  // LOBBY
  // ========================

  private showLobby() {
    this.lobbyUI = new LobbyUI((name) => {
      this.playerName = name;
      this.connectToServer(name);
    });
  }

  private async connectToServer(name: string) {
    const url = getServerUrl();
    this.lobbyUI.setStatus(`Connecting to ${url}...`);

    try {
      this.localPlayerId = await this.network.connect(url, { name });
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

    // Watch players join/leave
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

    // Watch phase changes
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

    // Watch countdown
    room.state.listen('countdown', (n: number) => {
      if (n > 0) this.lobbyUI.showCountdown(n);
    });

    // Watch star events
    this.network.on('starCollected', (msg: any) => {
      const pos = this.starRenderer.collectStar(msg.starId);
      if (pos) this.particleSystem.burst(pos);
      if (msg.playerId === this.localPlayerId) {
        this.showScorePopup(`+${STAR_POINTS} ⭐`);
      }
    });

    // Watch kite cut events
    this.network.on('kiteCut', (msg: any) => {
      if (msg.position) {
        this.particleSystem.burst(msg.position, 20);
      }
      if (msg.victimId === this.localPlayerId) {
        this.showScorePopup('✂️ CUT!');
      } else if (msg.cutterId === this.localPlayerId) {
        this.showScorePopup('🔥 +50 CUT!');
      }
    });

    this.network.on('disconnected', () => {
      this.lobbyUI.show();
      this.lobbyUI.setStatus('Disconnected from server', true);
      this.lobbyUI.enableReconnect();
    });
  }

  // ========================
  // PLAYER VIEW MANAGEMENT
  // ========================

  private createPlayerView(sessionId: string, player: any) {
    if (this.playerViews.has(sessionId)) return;

    const isLocal = sessionId === this.localPlayerId;
    const view = new PlayerView(
      this.gameLayer,
      sessionId,
      player.name || 'Player',
      player.colorIndex ?? 0,
      isLocal,
    );
    this.playerViews.set(sessionId, view);
  }

  private removePlayerView(sessionId: string) {
    const view = this.playerViews.get(sessionId);
    if (view) {
      view.destroy();
      this.playerViews.delete(sessionId);
    }
  }

  private updateLobbyPlayers() {
    const state = this.network.state;
    if (!state) return;

    const players: Array<{ name: string; color: string; isLocal: boolean; ready: boolean }> = [];
    state.players.forEach((p: any, id: string) => {
      const palette = PLAYER_COLORS[p.colorIndex % PLAYER_COLORS.length];
      players.push({
        name: p.name || 'Player',
        color: palette.primary,
        isLocal: id === this.localPlayerId,
        ready: p.ready,
      });
    });

    this.lobbyUI.updatePlayers(players);
    const readyCount = players.filter(p => p.ready).length;
    const total = players.length;
    if (total < 2) {
      this.lobbyUI.setStatus(`Waiting for opponent... (${total}/2 min)`);
    } else {
      this.lobbyUI.setStatus(`${readyCount}/${total} ready`);
    }
  }

  // ========================
  // GAME PHASE TRANSITIONS
  // ========================

  private onCountdown() {
    // Lobby shows countdown overlay
  }

  private onGameStart() {
    this.lobbyUI.hide();
    this.gameTime = 0;
    this.inputSeq = 0;
  }

  private onGameEnd() {
    const state = this.network.state;
    if (!state) return;

    // Show results in lobby
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
  // NETWORK EVENTS
  // ========================

  private setupNetworkEvents() {
    // Additional network handlers if needed
  }

  // ========================
  // RENDER LOOP
  // ========================

  private startRenderLoop() {
    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS / 1000;
      this.gameTime += dt;
      this.tick(dt);
    });
  }

  private tick(dt: number) {
    const state = this.network.state;
    const isPlaying = state?.phase === 'playing';

    // --- Always render background ---
    this.skyRenderer.update(this.gameTime);
    const wind: WindState = state
      ? { speed: state.wind.speed, direction: state.wind.direction, changeTimer: state.wind.changeTimer }
      : { speed: 1, direction: 1, changeTimer: 5 };
    this.cloudRenderer.update(wind);
    this.birdRenderer.update(this.gameTime, dt);

    if (!isPlaying || !state) {
      // During lobby, just show sky
      this.particleSystem.update(dt);
      return;
    }

    // --- Send local input to server ---
    const input: PlayerInput = {
      seq: ++this.inputSeq,
      timestamp: this.gameTime,
      pull: this.input.isPulling(),
      steer: this.input.getSteer(),
    };
    this.network.sendInput(input);

    // --- Sync stars from server ---
    const starList: StarData[] = [];
    if (state.stars) {
      state.stars.forEach((s: any) => {
        starList.push({
          id: s.id,
          position: { x: s.position.x, y: s.position.y },
          size: s.size,
          active: s.active,
          pulse: this.gameTime * 2,
        });
      });
    }
    this.starRenderer.syncStars(starList);
    this.starRenderer.update(this.gameTime);

    // --- Render each player from server state ---
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

      // Local player: client-side prediction for smoother feel
      if (isLocal && this.input.isPulling() !== undefined) {
        // Run prediction: take server state, replay unprocessed inputs
        const pending = this.network.getPendingInputs(player.lastProcessedInput);
        let predicted = { ...kite };
        for (const pi of pending) {
          const result = stepKite(predicted, anchor, pi, wind, [], this.gameTime, FIXED_DT);
          predicted = result.kite;
        }
        view.update(predicted, anchor, wind, this.input.isPulling(), this.gameTime);
      } else {
        // Remote players: render server state directly
        view.update(kite, anchor, wind, false, this.gameTime);
      }

      // Update name if changed
      view.setName(player.name || 'Player');
    });

    // Particles
    this.particleSystem.update(dt);

    // HUD
    this.updateHUD(state, wind);
  }

  // ========================
  // HUD
  // ========================

  private updateHUD(state: any, wind: WindState) {
    const localPlayer = state.players.get(this.localPlayerId);

    // Height
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
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    this.hudTime.textContent = `${mins}:${String(s).padStart(2, '0')}`;

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
      rows.push(`
        <div class="sb-row${isLocal ? ' local' : ''}">
          <div class="sb-dot" style="background:${palette.primary}"></div>
          <span class="sb-name">${p.name || 'Player'}</span>
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

  private showScorePopup(text: string) {
    const el = document.getElementById('score-popup')!;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.scorePopupTimer as unknown as number);
    this.scorePopupTimer = window.setTimeout(() => {
      el.classList.remove('show');
    }, 1200);
  }

  onResize(screenW: number, screenH: number) {
    const scaleX = screenW / WORLD_WIDTH;
    const scaleY = screenH / WORLD_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    this.worldContainer.scale.set(scale);
    this.worldContainer.position.set(
      (screenW - WORLD_WIDTH * scale) / 2,
      (screenH - WORLD_HEIGHT * scale) / 2,
    );
  }
}
