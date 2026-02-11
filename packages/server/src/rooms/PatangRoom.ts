// ============================================
// PATANG BAZI — Patang Room
// Server-authoritative game room
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
  WIND_MIN_SPEED,
  WIND_MAX_SPEED,
  WIND_CHANGE_MIN_TIME,
  WIND_CHANGE_MAX_TIME,
  SCORE_KITE_CUT,
  PENCH_DURATION,
  PENCH_TENSION_FACTOR,
  MessageType,
  stepKite,
  checkPench,
  type PlayerInput,
  type RoomJoinOptions,
} from '@patang/shared';

// Key for a pench pair (always sorted so A < B)
function penchKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
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
  private colorAssignment = 0;
  private rngSeed = Date.now();

  // Active pench battles
  private activePenches = new Map<string, PenchTracker>();

  // Spark sound throttle
  private lastSparkBroadcast = 0;

  onCreate(options: RoomJoinOptions) {
    this.setState(new GameRoomState());
    this.maxClients = MAX_PLAYERS_PER_ROOM;

    if (options.roomCode) {
      this.setMetadata({ roomCode: options.roomCode });
    }

    this.onMessage(MessageType.INPUT, (client, input: PlayerInput) => {
      this.currentInputs.set(client.sessionId, input);
    });

    this.onMessage(MessageType.PLAYER_READY, (client, data: { name: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.name = data.name || 'Player';
        player.ready = true;
      }
      this.checkAllReady();
    });

    this.onMessage(MessageType.REQUEST_REMATCH, (_client) => {
      // TODO: rematch voting
    });

    console.log(`🏠 Room created: ${this.roomId}`);
  }

  onJoin(client: any, options: RoomJoinOptions) {
    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = options.name || 'Player';
    player.colorIndex = this.colorAssignment % PLAYER_COLORS.length;
    player.connected = true;

    const playerCount = this.state.players.size;
    const spacing = WORLD_WIDTH / (MAX_PLAYERS_PER_ROOM + 1);
    player.anchorPosition.x = spacing * (playerCount + 1);
    player.anchorPosition.y = GROUND_Y;

    player.kite.position.x = player.anchorPosition.x;
    player.kite.position.y = WORLD_HEIGHT * 0.65;
    player.kite.alive = true;

    this.state.players.set(client.sessionId, player);
    this.currentInputs.set(client.sessionId, {
      seq: 0, timestamp: 0, pull: false, steer: 0,
    });

    this.colorAssignment++;
    console.log(`👤 ${player.name} joined (${client.sessionId})`);
  }

  onLeave(client: any, consented: boolean) {
    const player = this.state.players.get(client.sessionId);

    if (consented) {
      this.state.players.delete(client.sessionId);
      this.currentInputs.delete(client.sessionId);
      // Clean up any penches involving this player
      this.cleanupPenchesFor(client.sessionId);
    } else {
      if (player) player.connected = false;
    }

    console.log(`👤 Player left: ${client.sessionId} (consented: ${consented})`);

    const activePlayers = Array.from(this.state.players.values()).filter(p => p.connected);
    if (activePlayers.length === 0 && this.state.phase === 'playing') {
      this.endGame();
    }
  }

  onDispose() {
    if (this.physicsInterval) clearInterval(this.physicsInterval);
    console.log(`🏠 Room disposed: ${this.roomId}`);
  }

  // --- Game Flow ---

  private checkAllReady() {
    const players = Array.from(this.state.players.values());
    if (players.length < 1) return;  // Min 1 for testing, 2 for prod
    if (!players.every(p => p.ready)) return;
    this.startCountdown();
  }

  private startCountdown() {
    this.state.phase = 'countdown';
    this.state.countdown = 3;
    const countdownInterval = setInterval(() => {
      this.state.countdown--;
      this.broadcast(MessageType.PENCH_END, { type: 'countdown_beep', n: this.state.countdown });
      if (this.state.countdown <= 0) {
        clearInterval(countdownInterval);
        this.startGame();
      }
    }, 1000);
  }

  private startGame() {
    this.state.phase = 'playing';
    this.state.timeRemaining = 180;
    this.gameTime = 0;
    this.spawnStars(4);
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

    // Clean all penches
    this.activePenches.clear();
    while (this.state.penches.length > 0) this.state.penches.pop();

    const rankings = Array.from(this.state.players.values())
      .sort((a, b) => b.score - a.score)
      .map(p => ({ playerId: p.id, name: p.name, score: p.score, kiteCuts: 0 }));

    this.broadcast(MessageType.GAME_OVER, { rankings });
    console.log(`🏆 Game over in room ${this.roomId}`);
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

    const starsForPhysics = this.state.stars.filter(s => s.active).map(s => ({
      id: s.id, position: { x: s.position.x, y: s.position.y }, size: s.size, active: s.active,
    }));

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
          setTimeout(() => this.spawnStars(1), delay);
        }
      }
    });

    // --- Progressive Pench System ---
    this.updatePenches();

    // Star count
    const activeStars = this.state.stars.filter(s => s.active).length;
    if (activeStars < 2) this.spawnStars(STAR_MAX_COUNT - activeStars);
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
              playerAId: a.id,
              playerBId: b.id,
              progress: 0,
              winnerId,
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
              key,
              progress: tracker.progress,
              position: result.position,
              winnerId,
              spark: true,
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
          if (schema) {
            schema.progress = tracker.progress;
          }
        }
      }
    }
  }

  private resolvePenchCut(
    key: string,
    winner: PlayerSchema,
    loser: PlayerSchema,
    position: { x: number; y: number },
  ) {
    // Cut the loser's kite
    loser.kite.alive = false;
    winner.score += SCORE_KITE_CUT;

    this.broadcast(MessageType.KITE_CUT, {
      cutterId: winner.id,
      victimId: loser.id,
      position,
    });

    // Clean up pench
    this.endPench(key);

    // Respawn loser after 3 seconds
    setTimeout(() => {
      if (this.state.phase !== 'playing') return;
      const player = this.state.players.get(loser.id);
      if (!player) return;
      player.kite.alive = true;
      player.kite.position.x = player.anchorPosition.x;
      player.kite.position.y = WORLD_HEIGHT * 0.65;
      player.kite.velocity.x = 0;
      player.kite.velocity.y = 0;
    }, 3000);

    console.log(`✂️ ${winner.name} cut ${loser.name}'s kite!`);
  }

  private endPench(key: string) {
    const tracker = this.activePenches.get(key);
    if (!tracker) return;

    // Remove from schema array
    const idx = this.state.penches.findIndex(p => p.id === key);
    if (idx >= 0) {
      this.state.penches.splice(idx, 1);
    }

    // Reindex remaining trackers
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
    for (const key of toRemove) {
      this.endPench(key);
    }
  }

  // --- Stars ---

  private spawnStars(count: number) {
    for (let i = 0; i < count; i++) {
      if (this.state.stars.filter(s => s.active).length >= STAR_MAX_COUNT) break;
      const star = new StarSchema();
      star.id = `star_${this.state.tick}_${i}_${Math.floor(this.seededRandom() * 10000)}`;
      star.position.x = WORLD_WIDTH * 0.15 + this.seededRandom() * WORLD_WIDTH * 0.7;
      star.position.y = WORLD_HEIGHT * 0.08 + this.seededRandom() * WORLD_HEIGHT * 0.45;
      star.size = STAR_MIN_SIZE + this.seededRandom() * (STAR_MAX_SIZE - STAR_MIN_SIZE);
      star.active = true;
      this.state.stars.push(star);
    }
  }

  private seededRandom(): number {
    this.rngSeed = (this.rngSeed * 16807 + 0) % 2147483647;
    return this.rngSeed / 2147483647;
  }
}
