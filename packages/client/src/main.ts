// ============================================
// PATANG BAZI — Client Entry Point
// ============================================

import { Application } from 'pixi.js';
import { Game } from './game/Game';
import { InputManager } from './systems/InputManager';
import { NetworkManager } from './network/NetworkManager';

async function bootstrap() {
  const app = new Application();

  await app.init({
    background: 0x000000,         // Black fallback (sky covers it)
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    preference: 'webgpu',
    powerPreference: 'high-performance',
  });

  const container = document.getElementById('game-container')!;
  container.appendChild(app.canvas);

  const rendererType = (app.renderer as any).type === 0x02 ? 'WebGPU' : 'WebGL';
  console.log(`🪁 Patang Bazi | Renderer: ${rendererType} | DPR: ${app.renderer.resolution}x`);

  const input = new InputManager(app.canvas as HTMLCanvasElement);
  const network = new NetworkManager();
  const game = new Game(app, input, network);
  await game.init();

  window.addEventListener('resize', () => {
    game.onResize(window.innerWidth, window.innerHeight);
  });
}

bootstrap().catch(console.error);
