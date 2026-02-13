// ============================================
// PATANG BAZI — Patang Room
// Server-authoritative game room
// Hot-join: new players enter mid-game instantly
// Progressive pench system
// ============================================

import colyseus from 'colyseus';
const { Room } = colyseus;
import {
  GameRoomState,
  PlayerSchema,
  StarSchema,
  PenchSchema,
} from '../schemas/GameRoomState.js';
import {
  MAX_PLAYERS_PER_ROOM,
  PLAYER_COLORS,
  FIXED_DT,
  TICK_RATE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GROUND_Y,
  STAR_MAX_COUNT,
  STAR_MIN_SIZE,
  STAR_MAX_SIZE,
  STAR_SPAWN_DELAY_MIN,
  STAR_SPAWN_DELAY_MAX,
  STAR_POINTS,
  STAR_LIFETIME_MIN,
  STAR_LIFETIME_MAX,
  WIND_MIN_SPEED,
  WIND_MAX_SPEED,
  WIND_CHANGE_MIN_TIME,
  WIND_CHANGE_MAX_TIME,
  SCORE_KITE_CUT,
  PENCH_DURATION,
  PENCH_TENSION_FACTOR,
  DISCONNECT_TIMEOUT,
  ROUND_DURATION,
  MIN_PLAYERS_TO_START,
  COUNTDOWN_SECONDS,
  KITE_RESPAWN_DELAY,
  BOT_SPAWN_DELAY,
  MessageType,
  stepKite,
  checkPench,
  type PlayerInput,
  type RoomJoinOptions,
} from '@patang/shared';
import { BotManager } from '../bot/BotManager.js';

// Key for a pench pair (always sorted so A < B)
function penchKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
}

/** Sanitize player name: trim, limit length, strip dangerous chars */
function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'Player';
  return raw.trim().replace(/[<>&"']/g, '').slice(0, 16) || 'Player';
}

// Server-side pench tracker
interface PenchTracker {
  playerAId: string;
  playerBId: string;
  progress: number;     // 0 → 1
  winnerId: string;     // who's winning right now
  ticksSinceStart: number;
  schemaIndex: number;  // index into state.penches array
}

export class PatangRoom extends Room<GameRoomState> {
  private currentInputs = new Map<string, PlayerInput>();
  private gameTime = 0;
  private physicsInterval: ReturnType<typeof setInterval> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private colorAssignment = 0;
  private rngSeed = Date.now();

  // Active pench battles
  private activePenches = new Map<string, PenchTracker>();

  // Spark sound throttle
  private lastSparkBroadcast = 0;

  // Disconnect cleanup timers (sessionId → timeout)
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Bot system
  private botManager = new BotManager();
  private botSpawnTimer: ReturnType<typeof setTimeout> | null = null;

  onCreate(_options: RoomJoinOptions) {
    this.setState(new GameRoomState());
    this.maxClients = MAX_PLAYERS_PER_ROOM;

    this.onMessage(MessageType.INPUT, (client, input: PlayerInput) => {
      // Validate and clamp to prevent cheating
      input.steer = Math.max(-1, Math.min(1, input.steer || 0));
      input.pull = !!input.pull;  // Coerce to boolean
      this.currentInputs.set(client.sessionId, input);
    });

    this.onMessage(MessageType.PLAYER_READY, (client, data: { name: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.name = sanitizeName(data.name);
        player.ready = true;
      }

      // Only trigger countdown if we're still in waiting phase
      if (this.state.phase === 'waiting') {
        this.checkAllReady();
        // If still waiting (not enough players), schedule bot spawn
        if (this.state.phase === 'waiting') {
          this.maybeScheduleBotSpawn();
        }
      }
      // If game is already playing, player is already hot-joined (see onJoin)
    });

    console.log(`🏠 Room created: ${this.roomId}`);
  }

  onJoin(client: any, options: RoomJoinOptions) {
    const isHotJoin = this.state.phase === 'playing' || this.state.phase === 'countdown';

    // Cancel bot spawn if a real player joins during waiting
    if (this.state.phase === 'waiting') {
      this.cancelBotSpawnTimer();
    }

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = sanitizeName(options.name);
    player.colorIndex = this.colorAssignment % PLAYER_COLORS.length;
    player.connected = true;

    // Position: spread players evenly across the world
    const playerIndex = this.state.players.size;
    const spacing = WORLD_WIDTH / (MAX_PLAYERS_PER_ROOM + 1);
    player.anchorPosition.x = spacing * (playerIndex + 1);
    player.anchorPosition.y = GROUND_Y;

    player.kite.position.x = player.anchorPosition.x;
    player.kite.position.y = WORLD_HEIGHT * 0.65;
    player.kite.alive = true;

    // Hot-join: player is immediately ready and active
    if (isHotJoin) {
      player.ready = true;
    }

    this.state.players.set(client.sessionId, player);
    this.currentInputs.set(client.sessionId, {
      seq: 0, timestamp: 0, pull: false, steer: 0,
    });

    this.colorAssignment++;

    // Notify ALL clients about the join (for toast notifications)
    this.broadcast(MessageType.PLAYER_JOINED, {
      playerId: client.sessionId,
      name: player.name,
      colorIndex: player.colorIndex,
      hotJoin: isHotJoin,
    });

    console.log(`👤 ${player.name} joined (${client.sessionId}) [hot=${isHotJoin}]`);
  }

  onLeave(client: any, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    const playerName = player?.name || 'Player';

    // Clear any existing disconnect timer for this player
    const existingTimer = this.disconnectTimers.get(client.sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.disconnectTimers.delete(client.sessionId);
    }

    if (consented) {
      // Immediate removal
      this.state.players.delete(client.sessionId);
      this.currentInputs.delete(client.sessionId);
      this.cleanupPenchesFor(client.sessionId);

      // End game if no real players remain (bots don't count)
      if (this.getRealPlayerCount() === 0 && this.state.phase === 'playing') {
        this.endGame();
      }
    } else {
      // Non-consented: mark disconnected, start removal timer
      if (player) player.connected = false;

      // Check immediately — if no real players connected, end now
      if (this.getRealPlayerCount() === 0 && this.state.phase === 'playing') {
        this.endGame();
        return;
      }

      const timer = setTimeout(() => {
        this.disconnectTimers.delete(client.sessionId);
        const p = this.state.players.get(client.sessionId);
        if (p && !p.connected) {
          console.log(`⏰ Removing disconnected player: ${playerName} (${client.sessionId})`);
          this.state.players.delete(client.sessionId);
          this.currentInputs.delete(client.sessionId);
          this.cleanupPenchesFor(client.sessionId);

          // End game if no real players remain
          if (this.getRealPlayerCount() === 0 && this.state.phase === 'playing') {
            this.endGame();
          }
        }
      }, DISCONNECT_TIMEOUT * 1000);

      this.disconnectTimers.set(client.sessionId, timer);
    }

    // Cancel bot timer if we're in waiting and player leaves
    if (this.state.phase === 'waiting') {
      this.cancelBotSpawnTimer();
    }

    // Notify remaining players
    this.broadcast(MessageType.PLAYER_LEFT, {
      playerId: client.sessionId,
      name: playerName,
    });

    console.log(`👤 ${playerName} left: ${client.sessionId} (consented: ${consented})`);
  }

  onDispose() {
    if (this.physicsInterval) clearInterval(this.physicsInterval);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.cancelBotSpawnTimer();
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
    this.botManager.destroy();
    console.log(`🏠 Room disposed: ${this.roomId}`);
  }

  // --- Game Flow ---

  /** Count real (non-bot) connected players */
  private getRealPlayerCount(): number {
    let count = 0;
    this.state.players.forEach(p => {
      if (p.connected && !this.botManager.isBot(p.id)) count++;
    });
    return count;
  }

  private checkAllReady() {
    // Only called when phase === 'waiting'
    const players = Array.from(this.state.players.values());
    if (players.length < MIN_PLAYERS_TO_START) return;
    if (!players.every(p => p.ready)) return;
    this.cancelBotSpawnTimer();
    this.startCountdown();
  }

  /**
   * Start a timer to spawn a bot if the player is waiting alone.
   * Called when a real player readies up and is the only one.
   */
  private maybeScheduleBotSpawn() {
    if (this.state.phase !== 'waiting') return;
    this.cancelBotSpawnTimer();

    const realReady = Array.from(this.state.players.values())
      .filter(p => p.ready && !this.botManager.isBot(p.id));

    // Only spawn bot if exactly 1 real player is waiting
    if (realReady.length !== 1) return;

    this.botSpawnTimer = setTimeout(() => {
      this.botSpawnTimer = null;
      if (this.state.phase !== 'waiting') return;

      // Double-check: still only 1 real player?
      const stillAlone = this.getRealPlayerCount() < MIN_PLAYERS_TO_START;
      if (!stillAlone) return;

      // Spawn bot
      const result = this.botManager.spawn(
        this.state.players as any,
        this.currentInputs,
        this.colorAssignment,
      );
      if (result) {
        this.colorAssignment = result.newColorAssignment;

        // Notify clients about the "player" joining
        const botPlayer = this.state.players.get(result.botId);
        if (botPlayer) {
          this.broadcast(MessageType.PLAYER_JOINED, {
            playerId: result.botId,
            name: botPlayer.name,
            colorIndex: botPlayer.colorIndex,
            hotJoin: false,
          });
        }

        // Now re-check if we can start
        this.checkAllReady();
      }
    }, BOT_SPAWN_DELAY);
  }

  private cancelBotSpawnTimer() {
    if (this.botSpawnTimer) {
      clearTimeout(this.botSpawnTimer);
      this.botSpawnTimer = null;
    }
  }

  private startCountdown() {
    if (this.state.phase !== 'waiting') return; // Guard: only from waiting

    this.state.phase = 'countdown';
    this.state.countdown = COUNTDOWN_SECONDS;

    this.countdownInterval = setInterval(() => {
      this.state.countdown--;
      if (this.state.countdown <= 0) {
        if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
        this.startGame();
      }
    }, 1000);
  }

  private startGame() {
    this.state.phase = 'playing';
    this.state.timeRemaining = ROUND_DURATION;
    this.gameTime = 0;
    this.spawnStars(4, true);  // stagger: randomize initial ages
    this.state.wind.speed = 1;
    this.state.wind.direction = 1;
    this.state.wind.changeTimer = 5;

    this.physicsInterval = setInterval(() => {
      this.serverTick();
    }, 1000 / TICK_RATE);

    console.log(`🎮 Game started in room ${this.roomId}`);
  }

  private endGame() {
    this.state.phase = 'finished';
    if (this.physicsInterval) { clearInterval(this.physicsInterval); this.physicsInterval = null; }
    if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
    this.cancelBotSpawnTimer();

    // Clean all penches
    this.activePenches.clear();
    while (this.state.penches.length > 0) this.state.penches.pop();

    const rankings = Array.from(this.state.players.values())
      .sort((a, b) => b.score - a.score)
      .map(p => ({ playerId: p.id, name: p.name, score: p.score, kiteCuts: p.cuts }));

    this.broadcast(MessageType.GAME_OVER, { rankings });

    // Remove bots from state (clients don't need them after game over)
    this.botManager.removeAll(this.state.players as any, this.currentInputs);

    console.log(`🏆 Game over in room ${this.roomId}`);

    // Auto-disconnect all clients after a grace period
    // (clients should disconnect themselves after seeing results,
    //  but this ensures cleanup if they don't)
    setTimeout(() => {
      if (this.state.phase === 'finished') {
        this.disconnect();
      }
    }, 10000);
  }

  // --- Main Tick ---

  private serverTick() {
    if (this.state.phase !== 'playing') return;

    this.gameTime += FIXED_DT;
    this.state.tick++;
    this.state.timeRemaining -= FIXED_DT;

    if (this.state.timeRemaining <= 0) { this.endGame(); return; }

    // Wind
    this.state.wind.changeTimer -= FIXED_DT;
    if (this.state.wind.changeTimer <= 0) {
      this.state.wind.speed = WIND_MIN_SPEED + this.seededRandom() * (WIND_MAX_SPEED - WIND_MIN_SPEED);
      this.state.wind.direction = this.seededRandom() > 0.5 ? 1 : -1;
      this.state.wind.changeTimer = WIND_CHANGE_MIN_TIME + this.seededRandom() * (WIND_CHANGE_MAX_TIME - WIND_CHANGE_MIN_TIME);
    }

    const windState = {
      speed: this.state.wind.speed,
      direction: this.state.wind.direction,
      changeTimer: this.state.wind.changeTimer,
    };

    // Build active stars for physics (single pass, no extra allocations)
    const starsForPhysics: Array<{id: string; position: {x: number; y: number}; size: number; active: boolean}> = [];
    for (let i = 0; i < this.state.stars.length; i++) {
      const s = this.state.stars[i];
      if (!s) continue;
      if (s.active) {
        starsForPhysics.push({ id: s.id, position: { x: s.position.x, y: s.position.y }, size: s.size, active: true });
      }
    }

    // --- Update bot AI inputs (before physics so they participate this tick) ---
    if (this.botManager.count > 0) {
      // Gather pench involvement info for bot AI
      const penchPlayers = new Set<string>();
      const penchWinners = new Set<string>();
      for (const tracker of this.activePenches.values()) {
        penchPlayers.add(tracker.playerAId);
        penchPlayers.add(tracker.playerBId);
        if (tracker.winnerId) penchWinners.add(tracker.winnerId);
      }

      const botStars = starsForPhysics.map(s => ({
        x: s.position.x, y: s.position.y, active: s.active,
      }));

      this.botManager.updateAll(
        FIXED_DT,
        this.state.players as any,
        this.currentInputs,
        botStars,
        penchPlayers,
        penchWinners,
      );
    }

    // --- Step each player's kite ---
    this.state.players.forEach((player) => {
      if (!player.connected || !player.kite.alive) return;

      const input = this.currentInputs.get(player.id) ?? { seq: 0, timestamp: 0, pull: false, steer: 0 };
      const kiteState = {
        position: { x: player.kite.position.x, y: player.kite.position.y },
        velocity: { x: player.kite.velocity.x, y: player.kite.velocity.y },
        angle: player.kite.angle, tailPhase: player.kite.tailPhase, alive: player.kite.alive,
      };
      const anchor = { x: player.anchorPosition.x, y: player.anchorPosition.y };

      const result = stepKite(kiteState, anchor, input, windState, starsForPhysics, this.gameTime, FIXED_DT);

      player.kite.position.x = result.kite.position.x;
      player.kite.position.y = result.kite.position.y;
      player.kite.velocity.x = result.kite.velocity.x;
      player.kite.velocity.y = result.kite.velocity.y;
      player.kite.angle = result.kite.angle;
      player.kite.tailPhase = result.kite.tailPhase;
      player.lastProcessedInput = input.seq;

      for (const starId of result.collectedStars) {
        const star = this.state.stars.find(s => s.id === starId);
        if (star && star.active) {
          star.active = false;
          player.score += STAR_POINTS;
          this.broadcast(MessageType.STAR_COLLECTED, { starId, playerId: player.id, newScore: player.score });
          const delay = STAR_SPAWN_DELAY_MIN + this.seededRandom() * (STAR_SPAWN_DELAY_MAX - STAR_SPAWN_DELAY_MIN);
          setTimeout(() => {
            if (this.state.phase === 'playing') this.spawnStars(1);
          }, delay);
        }
      }
    });

    // --- Progressive Pench System ---
    this.updatePenches();

    // --- Star expiration: despawn stars that exceeded their lifetime ---
    let activeStars = 0;
    for (let i = 0; i < this.state.stars.length; i++) {
      const star = this.state.stars[i];
      if (!star) continue;
      if (!star.active) continue;
      const age = this.gameTime - star.spawnTime;
      if (age >= star.lifetime) {
        star.active = false;
        // Schedule respawn after delay
        const delay = STAR_SPAWN_DELAY_MIN + this.seededRandom() * (STAR_SPAWN_DELAY_MAX - STAR_SPAWN_DELAY_MIN);
        setTimeout(() => {
          if (this.state.phase === 'playing') this.spawnStars(1);
        }, delay);
      } else {
        activeStars++;
      }
    }

    // Ensure minimum stars on the field
    if (activeStars < 2) this.spawnStars(STAR_MAX_COUNT - activeStars);

    // Periodic cleanup: remove inactive stars from array every 5 seconds
    if (this.state.tick % (TICK_RATE * 5) === 0) {
      this.cleanupStarArray();
    }
  }

  // =====================
  // PROGRESSIVE PENCH
  // =====================

  private updatePenches() {
    const alivePlayers = Array.from(this.state.players.values())
      .filter(p => p.connected && p.kite.alive);

    // Track which pairs are currently crossing
    const currentCrossings = new Set<string>();

    for (let i = 0; i < alivePlayers.length; i++) {
      for (let j = i + 1; j < alivePlayers.length; j++) {
        const a = alivePlayers[i];
        const b = alivePlayers[j];
        const key = penchKey(a.id, b.id);

        const kiteA = {
          position: { x: a.kite.position.x, y: a.kite.position.y },
          velocity: { x: a.kite.velocity.x, y: a.kite.velocity.y },
          angle: a.kite.angle, tailPhase: a.kite.tailPhase, alive: true,
        };
        const kiteB = {
          position: { x: b.kite.position.x, y: b.kite.position.y },
          velocity: { x: b.kite.velocity.x, y: b.kite.velocity.y },
          angle: b.kite.angle, tailPhase: b.kite.tailPhase, alive: true,
        };

        const result = checkPench(
          kiteA, { x: a.anchorPosition.x, y: a.anchorPosition.y },
          kiteB, { x: b.anchorPosition.x, y: b.anchorPosition.y },
        );

        if (result.crossing) {
          currentCrossings.add(key);

          const inputA = this.currentInputs.get(a.id);
          const inputB = this.currentInputs.get(b.id);
          const speedA = Math.sqrt(a.kite.velocity.x ** 2 + a.kite.velocity.y ** 2);
          const speedB = Math.sqrt(b.kite.velocity.x ** 2 + b.kite.velocity.y ** 2);

          // Strength = base speed + pull bonus + tension factor
          const strengthA = speedA + (inputA?.pull ? 2.5 : 0) * (1 + PENCH_TENSION_FACTOR);
          const strengthB = speedB + (inputB?.pull ? 2.5 : 0) * (1 + PENCH_TENSION_FACTOR);

          // Who's winning?
          const winnerId = strengthA >= strengthB ? a.id : b.id;

          // Progress rate: faster if strength difference is bigger
          const diff = Math.abs(strengthA - strengthB);
          const baseRate = FIXED_DT / PENCH_DURATION;
          const progressRate = baseRate * (1 + diff * 0.3);

          let tracker = this.activePenches.get(key);

          if (!tracker) {
            // New pench! Create schema + tracker
            const schema = new PenchSchema();
            schema.id = key;
            schema.playerAId = a.id;
            schema.playerBId = b.id;
            schema.progress = 0;
            schema.position.x = result.position.x;
            schema.position.y = result.position.y;
            schema.active = true;
            schema.winnerId = winnerId;
            this.state.penches.push(schema);

            tracker = {
              playerAId: a.id, playerBId: b.id,
              progress: 0, winnerId,
              ticksSinceStart: 0,
              schemaIndex: this.state.penches.length - 1,
            };
            this.activePenches.set(key, tracker);

            this.broadcast(MessageType.PENCH_START, {
              key, playerAId: a.id, playerBId: b.id,
              position: result.position,
            });
          }

          // Update progress
          tracker.progress = Math.min(1, tracker.progress + progressRate);
          tracker.winnerId = winnerId;
          tracker.ticksSinceStart++;

          // Update schema for auto-sync
          const schema = this.state.penches[tracker.schemaIndex];
          if (schema) {
            schema.progress = tracker.progress;
            schema.position.x = result.position.x;
            schema.position.y = result.position.y;
            schema.winnerId = winnerId;
          }

          // Broadcast spark sounds periodically
          if (this.gameTime - this.lastSparkBroadcast > 0.15) {
            this.lastSparkBroadcast = this.gameTime;
            this.broadcast(MessageType.PENCH_UPDATE, {
              key, progress: tracker.progress,
              position: result.position, winnerId, spark: true,
            });
          }

          // CUT! Progress reached 1.0
          if (tracker.progress >= 1) {
            const loser = winnerId === a.id ? b : a;
            const winner = winnerId === a.id ? a : b;
            this.resolvePenchCut(key, winner, loser, result.position);
          }
        }
      }
    }

    // End penches where strings are no longer crossing
    for (const [key, tracker] of this.activePenches) {
      if (!currentCrossings.has(key)) {
        // Decay progress when not crossing (keeps some tension)
        tracker.progress = Math.max(0, tracker.progress - FIXED_DT * 0.8);
        if (tracker.progress <= 0) {
          this.endPench(key);
        } else {
          // Update schema with decaying progress
          const schema = this.state.penches[tracker.schemaIndex];
          if (schema) schema.progress = tracker.progress;
        }
      }
    }
  }

  private resolvePenchCut(
    key: string, winner: PlayerSchema, loser: PlayerSchema,
    position: { x: number; y: number },
  ) {
    // Cut the loser's kite
    loser.kite.alive = false;
    winner.score += SCORE_KITE_CUT;
    winner.cuts += 1;

    this.broadcast(MessageType.KITE_CUT, {
      cutterId: winner.id, victimId: loser.id, position,
    });

    // Clean up pench
    this.endPench(key);

    // Respawn loser after delay
    setTimeout(() => {
      if (this.state.phase !== 'playing') return;
      const player = this.state.players.get(loser.id);
      if (!player) return;
      player.kite.alive = true;
      player.kite.position.x = player.anchorPosition.x;
      player.kite.position.y = WORLD_HEIGHT * 0.65;
      player.kite.velocity.x = 0;
      player.kite.velocity.y = 0;
    }, KITE_RESPAWN_DELAY);

    console.log(`✂️ ${winner.name} cut ${loser.name}'s kite!`);
  }

  private endPench(key: string) {
    const tracker = this.activePenches.get(key);
    if (!tracker) return;

    // Remove from schema array
    const idx = this.state.penches.findIndex(p => p.id === key);
    if (idx >= 0) this.state.penches.splice(idx, 1);

    // Reindex all remaining trackers
    for (const [, t] of this.activePenches) {
      const newIdx = this.state.penches.findIndex(p => p.id === penchKey(t.playerAId, t.playerBId));
      if (newIdx >= 0) t.schemaIndex = newIdx;
    }

    this.activePenches.delete(key);
    this.broadcast(MessageType.PENCH_END, { key });
  }

  private cleanupPenchesFor(playerId: string) {
    const toRemove: string[] = [];
    for (const [key, tracker] of this.activePenches) {
      if (tracker.playerAId === playerId || tracker.playerBId === playerId) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) this.endPench(key);
  }

  // --- Stars ---

  private spawnStars(count: number, stagger = false) {
    for (let i = 0; i < count; i++) {
      // Count active stars without allocating a filtered array
      let activeCount = 0;
      for (let j = 0; j < this.state.stars.length; j++) {
        if (this.state.stars[j]?.active) activeCount++;
      }
      if (activeCount >= STAR_MAX_COUNT) break;
      const star = new StarSchema();
      star.id = `star_${this.state.tick}_${i}_${Math.floor(this.seededRandom() * 10000)}`;
      star.position.x = WORLD_WIDTH * 0.15 + this.seededRandom() * WORLD_WIDTH * 0.7;
      star.position.y = WORLD_HEIGHT * 0.08 + this.seededRandom() * WORLD_HEIGHT * 0.45;
      star.size = STAR_MIN_SIZE + this.seededRandom() * (STAR_MAX_SIZE - STAR_MIN_SIZE);
      star.active = true;
      star.lifetime = STAR_LIFETIME_MIN + this.seededRandom() * (STAR_LIFETIME_MAX - STAR_LIFETIME_MIN);
      // Stagger: initial batch gets random age so they don't all expire at once
      star.spawnTime = stagger
        ? this.gameTime - this.seededRandom() * star.lifetime * 0.6
        : this.gameTime;
      this.state.stars.push(star);
    }
  }

  /** Remove inactive stars from the array to prevent unbounded growth */
  private cleanupStarArray() {
    for (let i = this.state.stars.length - 1; i >= 0; i--) {
      const star = this.state.stars[i];
      if (!star || !star.active) {
        this.state.stars.splice(i, 1);
      }
    }
  }

  private seededRandom(): number {
    this.rngSeed = (this.rngSeed * 16807 + 0) % 2147483647;
    return this.rngSeed / 2147483647;
  }
}
