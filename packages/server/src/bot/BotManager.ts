// ============================================
// PATANG BAZI — Bot Manager
// Spawns, updates, and removes bots.
// Bots are PlayerSchema entries that look
// identical to real players from client's view.
// ============================================

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GROUND_Y,
  MAX_PLAYERS_PER_ROOM,
  PLAYER_COLORS,
  BOT_NAME_POOL,
  type PlayerInput,
} from '@patang/shared';
import { PlayerSchema } from '../schemas/GameRoomState.js';
import { BotController } from './BotController.js';

// Prefix so we can identify bot IDs internally
const BOT_ID_PREFIX = 'bot_';
let botCounter = 0;

interface BotEntry {
  id: string;
  controller: BotController;
}

export class BotManager {
  private bots = new Map<string, BotEntry>();

  /** Check if a player ID belongs to a bot */
  isBot(playerId: string): boolean {
    return this.bots.has(playerId);
  }

  /** How many bots are active */
  get count(): number {
    return this.bots.size;
  }

  /** Get all bot IDs */
  get botIds(): string[] {
    return Array.from(this.bots.keys());
  }

  /**
   * Spawn a bot into the room state.
   * Returns the bot's player ID, or null if room is full.
   */
  spawn(
    players: Map<string, PlayerSchema>,
    currentInputs: Map<string, PlayerInput>,
    colorAssignment: number,
  ): { botId: string; newColorAssignment: number } | null {
    if (players.size >= MAX_PLAYERS_PER_ROOM) return null;

    const botId = `${BOT_ID_PREFIX}${++botCounter}_${Date.now().toString(36)}`;

    // Pick a name that isn't already in use
    const usedNames = new Set(Array.from(players.values()).map(p => p.name));
    let name = BOT_NAME_POOL[Math.floor(Math.random() * BOT_NAME_POOL.length)];
    if (usedNames.has(name)) {
      name = name + Math.floor(Math.random() * 99);
    }

    // Create player schema (identical to real player)
    const player = new PlayerSchema();
    player.id = botId;
    player.name = name;
    player.colorIndex = colorAssignment % PLAYER_COLORS.length;
    player.connected = true;
    player.ready = true;

    // Position: spread evenly
    const playerIndex = players.size;
    const spacing = WORLD_WIDTH / (MAX_PLAYERS_PER_ROOM + 1);
    player.anchorPosition.x = spacing * (playerIndex + 1);
    player.anchorPosition.y = GROUND_Y;

    player.kite.position.x = player.anchorPosition.x;
    player.kite.position.y = WORLD_HEIGHT * 0.65;
    player.kite.alive = true;

    players.set(botId, player);
    currentInputs.set(botId, { seq: 0, timestamp: 0, pull: false, steer: 0 });

    const controller = new BotController(Date.now() + botCounter);
    this.bots.set(botId, { id: botId, controller });

    console.log(`🤖 Bot spawned: ${name} (${botId})`);
    return { botId, newColorAssignment: colorAssignment + 1 };
  }

  /**
   * Remove a bot from the room.
   */
  remove(
    botId: string,
    players: Map<string, PlayerSchema>,
    currentInputs: Map<string, PlayerInput>,
  ) {
    if (!this.bots.has(botId)) return;
    players.delete(botId);
    currentInputs.delete(botId);
    this.bots.delete(botId);
    console.log(`🤖 Bot removed: ${botId}`);
  }

  /**
   * Remove all bots from the room.
   */
  removeAll(
    players: Map<string, PlayerSchema>,
    currentInputs: Map<string, PlayerInput>,
  ) {
    for (const botId of this.bots.keys()) {
      players.delete(botId);
      currentInputs.delete(botId);
    }
    this.bots.clear();
  }

  /**
   * Update all bot inputs for this tick.
   * Call once per physics tick, BEFORE stepping player physics.
   */
  updateAll(
    dt: number,
    players: Map<string, PlayerSchema>,
    currentInputs: Map<string, PlayerInput>,
    stars: Array<{ x: number; y: number; active: boolean }>,
    activePenchPlayers: Set<string>,   // player IDs currently in a pench
    penchWinners: Set<string>,         // player IDs currently winning their pench
  ) {
    for (const [botId, entry] of this.bots) {
      const player = players.get(botId);
      if (!player) continue;

      // Build world view for bot AI
      const opponents: Array<{ kiteX: number; kiteY: number; alive: boolean }> = [];
      players.forEach((p) => {
        if (p.id !== botId && p.connected && p.kite.alive) {
          opponents.push({
            kiteX: p.kite.position.x,
            kiteY: p.kite.position.y,
            alive: p.kite.alive,
          });
        }
      });

      const input = entry.controller.update(dt, {
        kiteX: player.kite.position.x,
        kiteY: player.kite.position.y,
        kiteAlive: player.kite.alive,
        anchorX: player.anchorPosition.x,
        anchorY: player.anchorPosition.y,
        stars,
        opponents,
        inPench: activePenchPlayers.has(botId),
        penchWinning: penchWinners.has(botId),
      });

      currentInputs.set(botId, input);
    }
  }

  /** Clean up everything */
  destroy() {
    this.bots.clear();
  }
}
