// ============================================
// PATANG BAZI — Game Core
// Full game loop with all visual renderers
// ============================================

import { Application, Container } from 'pixi.js';
import { InputManager } from '../systems/InputManager';
import { NetworkManager } from '../network/NetworkManager';
import { SkyRenderer } from '../systems/SkyRenderer';
import { KiteRenderer } from '../systems/KiteRenderer';
import { StringRenderer } from '../systems/StringRenderer';
import { StarRenderer, type StarData } from '../systems/StarRenderer';
import { GroundRenderer } from '../systems/GroundRenderer';
import { CloudRenderer } from '../systems/CloudRenderer';
import { BirdRenderer } from '../systems/BirdRenderer';
import { PersonRenderer } from '../systems/PersonRenderer';
import { ParticleSystem } from '../systems/ParticleSystem';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GROUND_Y,
  FIXED_DT,
  STAR_POINTS,
  STAR_MAX_COUNT,
  STAR_MIN_SIZE,
  STAR_MAX_SIZE,
  WIND_MIN_SPEED,
  WIND_MAX_SPEED,
  WIND_CHANGE_MIN_TIME,
  WIND_CHANGE_MAX_TIME,
  stepKite,
  vec2,
  type KiteState,
  type WindState,
  type PlayerInput,
} from '@patang/shared';

export class Game {
  private app: Application;
  private input: InputManager;
  public network: NetworkManager;

  // Scene graph layers (back to front)
  private worldContainer!: Container;
  private skyLayer!: Container;
  private cloudLayer!: Container;
  private gameLayer!: Container;
  private effectLayer!: Container;

  // Renderers
  private skyRenderer!: SkyRenderer;
  private cloudRenderer!: CloudRenderer;
  private birdRenderer!: BirdRenderer;
  private kiteRenderer!: KiteRenderer;
  private stringRenderer!: StringRenderer;
  private starRenderer!: StarRenderer;
  private personRenderer!: PersonRenderer;
  private particleSystem!: ParticleSystem;

  // Game state
  private gameTime = 0;
  private accumulator = 0;
  private inputSeq = 0;
  private score = 0;

  private localKite: KiteState = {
    position: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT * 0.65 },
    velocity: { x: 0, y: 0 },
    angle: 0,
    tailPhase: 0,
    alive: true,
  };
  private localAnchor = vec2(WORLD_WIDTH / 2, GROUND_Y);
  private wind: WindState = { speed: 1, direction: 1, changeTimer: 5 };

  // Local stars (single player mode)
  private stars: StarData[] = [];
  private starIdCounter = 0;

  // HUD elements
  private hudHeight!: HTMLElement;
  private hudScore!: HTMLElement;
  private hudWind!: HTMLElement;

  constructor(app: Application, input: InputManager, network: NetworkManager) {
    this.app = app;
    this.input = input;
    this.network = network;
  }

  async init() {
    this.setupSceneGraph();
    this.setupRenderers();
    this.setupHUD();
    this.spawnInitialStars();
    this.startGameLoop();
  }

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
    // Background layers
    this.skyRenderer = new SkyRenderer(this.skyLayer, WORLD_WIDTH, WORLD_HEIGHT);
    this.cloudRenderer = new CloudRenderer(this.cloudLayer);
    this.birdRenderer = new BirdRenderer(this.cloudLayer);
    new GroundRenderer(this.skyLayer); // static, drawn once

    // Game objects
    this.stringRenderer = new StringRenderer(this.gameLayer);
    this.personRenderer = new PersonRenderer(this.gameLayer);
    this.starRenderer = new StarRenderer(this.gameLayer);
    this.kiteRenderer = new KiteRenderer(this.gameLayer);

    // Effects
    this.particleSystem = new ParticleSystem(this.effectLayer);
  }

  private setupHUD() {
    // Create HUD overlay in DOM
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
        .game-title {
          font-family: 'Baloo 2', cursive;
          font-size: 26px; font-weight: 800; color: #fff;
          text-shadow: 0 2px 20px rgba(255,150,50,0.4);
        }
        .stats { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
        .stat-pill {
          background: rgba(0,0,0,0.35);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px; padding: 5px 14px;
          font-size: 13px; font-weight: 500;
          color: rgba(255,255,255,0.7);
          display: flex; align-items: center; gap: 6px;
        }
        .stat-pill .val { color: #ffd666; font-weight: 700; font-size: 14px; }
        #score-popup {
          position: fixed; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          z-index: 20; pointer-events: none;
          font-family: 'Baloo 2', cursive;
          font-size: 48px; font-weight: 800;
          color: #ffd666;
          text-shadow: 0 4px 30px rgba(255,180,50,0.6);
          opacity: 0; transition: opacity 0.3s, transform 0.3s;
        }
        #score-popup.show { opacity: 1; transform: translate(-50%, -60%); }
        #controls-bar {
          position: fixed; bottom: 0; left: 0; right: 0;
          padding: 16px 24px; display: flex; justify-content: center;
          pointer-events: none; z-index: 10;
        }
        .controls-inner {
          background: rgba(0,0,0,0.3); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 10px 22px;
          display: flex; gap: 20px; font-size: 13px;
          color: rgba(255,255,255,0.55); font-weight: 500;
          font-family: 'Poppins', sans-serif;
        }
        .controls-inner kbd {
          background: rgba(255,214,102,0.15);
          border: 1px solid rgba(255,214,102,0.3);
          border-radius: 5px; padding: 1px 7px;
          color: #ffd666; font-weight: 700; font-size: 12px;
        }
        @media (max-width: 768px) { .controls-inner { display: none; } }
      </style>
      <div class="game-title">🪁 PATANG BAZI</div>
      <div class="stats">
        <div class="stat-pill">📍 Height <span class="val" id="hAlt">0</span>m</div>
        <div class="stat-pill">⭐ Score <span class="val" id="hScore">0</span></div>
        <div class="stat-pill">💨 Wind <span class="val" id="hWind">→</span></div>
      </div>
    `;
    document.body.appendChild(hud);

    // Score popup
    const popup = document.createElement('div');
    popup.id = 'score-popup';
    document.body.appendChild(popup);

    // Controls bar
    const controls = document.createElement('div');
    controls.id = 'controls-bar';
    controls.innerHTML = `
      <div class="controls-inner">
        <span><kbd>SPACE</kbd> / <kbd>CLICK</kbd> Pull line up</span>
        <span><kbd>←</kbd> <kbd>→</kbd> Steer kite</span>
        <span>Release to glide</span>
      </div>
    `;
    document.body.appendChild(controls);

    this.hudHeight = document.getElementById('hAlt')!;
    this.hudScore = document.getElementById('hScore')!;
    this.hudWind = document.getElementById('hWind')!;
  }

  private spawnInitialStars() {
    for (let i = 0; i < 4; i++) {
      this.spawnStar();
    }
  }

  private spawnStar() {
    if (this.stars.filter(s => s.active).length >= STAR_MAX_COUNT) return;

    this.stars.push({
      id: `star_${this.starIdCounter++}`,
      position: {
        x: WORLD_WIDTH * 0.15 + Math.random() * WORLD_WIDTH * 0.7,
        y: WORLD_HEIGHT * 0.08 + Math.random() * WORLD_HEIGHT * 0.45,
      },
      size: STAR_MIN_SIZE + Math.random() * (STAR_MAX_SIZE - STAR_MIN_SIZE),
      active: true,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  private startGameLoop() {
    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS / 1000;
      this.update(dt);
    });
  }

  private update(dt: number) {
    // Fixed timestep for physics
    this.accumulator += dt;

    while (this.accumulator >= FIXED_DT) {
      this.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    // Variable timestep render
    this.render(dt);
  }

  private fixedUpdate(dt: number) {
    this.gameTime += dt;

    // Wind changes
    this.wind.changeTimer -= dt;
    if (this.wind.changeTimer <= 0) {
      this.wind.speed = WIND_MIN_SPEED + Math.random() * (WIND_MAX_SPEED - WIND_MIN_SPEED);
      this.wind.direction = Math.random() > 0.5 ? 1 : -1;
      this.wind.changeTimer = WIND_CHANGE_MIN_TIME + Math.random() * (WIND_CHANGE_MAX_TIME - WIND_CHANGE_MIN_TIME);
    }

    // Build input
    const input: PlayerInput = {
      seq: ++this.inputSeq,
      timestamp: this.gameTime,
      pull: this.input.isPulling(),
      steer: this.input.getSteer(),
    };

    // Convert stars for physics
    const physicsStars = this.stars.filter(s => s.active).map(s => ({
      id: s.id,
      position: s.position,
      size: s.size,
      active: s.active,
    }));

    // Run physics
    const result = stepKite(
      this.localKite,
      this.localAnchor,
      input,
      this.wind,
      physicsStars,
      this.gameTime,
      dt,
    );
    this.localKite = result.kite;

    // Handle star collection
    for (const starId of result.collectedStars) {
      const star = this.stars.find(s => s.id === starId);
      if (star && star.active) {
        star.active = false;
        this.score += STAR_POINTS;

        // Particle burst!
        const pos = this.starRenderer.collectStar(starId);
        if (pos) {
          this.particleSystem.burst(pos);
        }

        // Show popup
        this.showScorePopup(`+${STAR_POINTS} ⭐`);

        // Respawn after delay
        setTimeout(() => this.spawnStar(), 1500 + Math.random() * 2000);
      }
    }
  }

  private render(dt: number) {
    // Background
    this.skyRenderer.update(this.gameTime);
    this.cloudRenderer.update(this.wind);
    this.birdRenderer.update(this.gameTime, dt);

    // Sync stars
    this.starRenderer.syncStars(this.stars);
    this.starRenderer.update(this.gameTime);

    // String, person, kite
    this.stringRenderer.update(
      this.localAnchor,
      this.localKite.position,
      this.input.isPulling(),
      this.gameTime,
    );
    this.personRenderer.update(this.localAnchor, this.localKite.position);
    this.kiteRenderer.update(this.localKite, this.wind);

    // Particles
    this.particleSystem.update(dt);

    // HUD
    this.updateHUD();
  }

  private updateHUD() {
    const heightM = Math.max(0, Math.round((this.localAnchor.y - this.localKite.position.y) / (WORLD_HEIGHT * 0.008)));
    this.hudHeight.textContent = String(heightM);
    this.hudScore.textContent = String(this.score);

    const windArrow = this.wind.direction > 0 ? '→' : '←';
    const windStr = this.wind.speed < 0.5 ? 'Calm' : (this.wind.speed < 1 ? windArrow + ' Light' : windArrow + ' Strong');
    this.hudWind.textContent = windStr;
  }

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
    // Scale world to fit screen while maintaining aspect ratio
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
