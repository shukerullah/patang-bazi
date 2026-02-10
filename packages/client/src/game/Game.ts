// ============================================
// PATANG BAZI — Game Core
// Manages game loop, scenes, and system coordination
// ============================================

import { Application, Container } from 'pixi.js';
import { InputManager } from '../systems/InputManager';
import { NetworkManager } from '../network/NetworkManager';
import { SkyRenderer } from '../systems/SkyRenderer';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  FIXED_DT,
  stepKite,
  vec2,
  type KiteState,
  type WindState,
  type PlayerInput,
  type StarState,
} from '@patang/shared';

export class Game {
  private app: Application;
  private input: InputManager;
  // Network manager - used when multiplayer is connected
  public network: NetworkManager;

  // Scene graph layers (back to front)
  private worldContainer!: Container;
  private skyLayer!: Container;
  private cloudLayer!: Container;
  private gameLayer!: Container;   // kites, stars, strings
  private effectLayer!: Container; // particles, effects
  private uiLayer!: Container;     // HUD overlay

  // Systems
  private skyRenderer!: SkyRenderer;

  // Game state
  private gameTime = 0;
  private accumulator = 0;
  private inputSeq = 0;
  private localKite: KiteState = {
    position: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT * 0.65 },
    velocity: { x: 0, y: 0 },
    angle: 0,
    tailPhase: 0,
    alive: true,
  };
  private localAnchor = vec2(WORLD_WIDTH / 2, WORLD_HEIGHT * 0.92);
  private wind: WindState = { speed: 1, direction: 1, changeTimer: 5 };
  private stars: StarState[] = [];

  constructor(app: Application, input: InputManager, network: NetworkManager) {
    this.app = app;
    this.input = input;
    this.network = network;
  }

  async init() {
    this.setupSceneGraph();
    this.setupSystems();
    this.startGameLoop();
  }

  private setupSceneGraph() {
    // World container scales logical coords → screen coords
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    // Layers (rendering order)
    this.skyLayer = new Container();
    this.cloudLayer = new Container();
    this.gameLayer = new Container();
    this.effectLayer = new Container();
    this.uiLayer = new Container();

    this.worldContainer.addChild(
      this.skyLayer,
      this.cloudLayer,
      this.gameLayer,
      this.effectLayer,
      this.uiLayer,
    );

    this.onResize(window.innerWidth, window.innerHeight);
  }

  private setupSystems() {
    this.skyRenderer = new SkyRenderer(this.skyLayer, WORLD_WIDTH, WORLD_HEIGHT);
  }

  private startGameLoop() {
    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS / 1000; // seconds
      this.update(dt);
    });
  }

  private update(dt: number) {
    // --- Fixed timestep for physics ---
    this.accumulator += dt;

    while (this.accumulator >= FIXED_DT) {
      this.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    // --- Render (variable timestep) ---
    const alpha = this.accumulator / FIXED_DT; // interpolation factor
    this.render(alpha);
  }

  private fixedUpdate(dt: number) {
    this.gameTime += dt;

    // Build current input
    const input: PlayerInput = {
      seq: ++this.inputSeq,
      timestamp: this.gameTime,
      pull: this.input.isPulling(),
      steer: this.input.getSteer(),
    };

    // Run local physics prediction
    const result = stepKite(
      this.localKite,
      this.localAnchor,
      input,
      this.wind,
      this.stars,
      this.gameTime,
      dt,
    );
    this.localKite = result.kite;

    // TODO: Send input to server
    // this.network.sendInput(input);

    // TODO: Handle server reconciliation
  }

  private render(_alpha: number) {
    // Update visual systems
    this.skyRenderer.update(this.gameTime);

    // TODO: Render kites, strings, stars, particles
    // These will be PixiJS sprites/graphics managed by their own renderers
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
