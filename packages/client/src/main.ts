// ============================================
// PATANG BAZI — Client Entry Point
// Initializes PixiJS, input, network, and game loop
// ============================================

import { Application } from 'pixi.js';
import { Game } from './game/Game';
import { InputManager } from './systems/InputManager';
import { NetworkManager } from './network/NetworkManager';

async function bootstrap() {
  // --- Initialize PixiJS ---
  const app = new Application();

  await app.init({
    background: '#1a0a2e',
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    preference: 'webgpu',       // Try WebGPU first, fallback to WebGL2
    powerPreference: 'high-performance',
  });

  const container = document.getElementById('game-container')!;
  container.appendChild(app.canvas);

  console.log(
    `🪁 Patang Bazi | Renderer: ${app.renderer.type === 0x02 ? 'WebGPU' : 'WebGL'} | ` +
    `Resolution: ${app.renderer.resolution}x`
  );

  // --- Systems ---
  const input = new InputManager(app.canvas as HTMLCanvasElement);
  const network = new NetworkManager();

  // --- Game ---
  const game = new Game(app, input, network);
  await game.init();

  // --- Resize handler ---
  window.addEventListener('resize', () => {
    game.onResize(window.innerWidth, window.innerHeight);
  });

  console.log('🪁 Patang Bazi initialized!');
}

bootstrap().catch(console.error);
