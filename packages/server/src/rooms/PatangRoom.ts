// ============================================
// PATANG BAZI — Patang Room
// Server-authoritative game room
// ============================================

import colyseus from 'colyseus';
const { Room } = colyseus;
import {
  GameRoomState,
  PlayerSchema,
  StarSchema,
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
  MessageType,
  stepKite,
  checkPench,
  type PlayerInput,
  type RoomJoinOptions,
} from '@patang/shared';

export class PatangRoom extends Room<GameRoomState> {
  private inputQueues = new Map<string, PlayerInput[]>();
  private currentInputs = new Map<string, PlayerInput>();
  private gameTime = 0;
  private physicsInterval: ReturnType<typeof setInterval> | null = null;
  private colorAssignment = 0;
  private rngSeed = Date.now();

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
      // TODO: Implement proper rematch voting
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
    this.inputQueues.set(client.sessionId, []);
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
      this.inputQueues.delete(client.sessionId);
      this.currentInputs.delete(client.sessionId);
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

  private checkAllReady() {
    const players = Array.from(this.state.players.values());
    if (players.length < 1) return;  // Min 1 player (change to 2 for prod)
    if (!players.every(p => p.ready)) return;
    this.startCountdown();
  }

  private startCountdown() {
    this.state.phase = 'countdown';
    this.state.countdown = 3;
    const countdownInterval = setInterval(() => {
      this.state.countdown--;
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

    const rankings = Array.from(this.state.players.values())
      .sort((a, b) => b.score - a.score)
      .map(p => ({ playerId: p.id, name: p.name, score: p.score, kiteCuts: 0 }));

    this.broadcast(MessageType.GAME_OVER, { rankings });
    console.log(`🏆 Game over in room ${this.roomId}`);
  }

  private serverTick() {
    if (this.state.phase !== 'playing') return;

    this.gameTime += FIXED_DT;
    this.state.tick++;
    this.state.timeRemaining -= FIXED_DT;

    if (this.state.timeRemaining <= 0) { this.endGame(); return; }

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

    // Pench detection
    const playerList = Array.from(this.state.players.values()).filter(p => p.connected && p.kite.alive);
    for (let i = 0; i < playerList.length; i++) {
      for (let j = i + 1; j < playerList.length; j++) {
        const a = playerList[i], b = playerList[j];
        const kiteA = { position: { x: a.kite.position.x, y: a.kite.position.y }, velocity: { x: a.kite.velocity.x, y: a.kite.velocity.y }, angle: a.kite.angle, tailPhase: a.kite.tailPhase, alive: true };
        const kiteB = { position: { x: b.kite.position.x, y: b.kite.position.y }, velocity: { x: b.kite.velocity.x, y: b.kite.velocity.y }, angle: b.kite.angle, tailPhase: b.kite.tailPhase, alive: true };
        const pench = checkPench(kiteA, { x: a.anchorPosition.x, y: a.anchorPosition.y }, kiteB, { x: b.anchorPosition.x, y: b.anchorPosition.y });

        if (pench.crossing) {
          const speedA = Math.sqrt(a.kite.velocity.x ** 2 + a.kite.velocity.y ** 2);
          const speedB = Math.sqrt(b.kite.velocity.x ** 2 + b.kite.velocity.y ** 2);
          const strengthA = speedA + (this.currentInputs.get(a.id)?.pull ? 2 : 0);
          const strengthB = speedB + (this.currentInputs.get(b.id)?.pull ? 2 : 0);
          if (strengthA > strengthB * 1.3) this.cutKite(a, b, pench.position);
          else if (strengthB > strengthA * 1.3) this.cutKite(b, a, pench.position);
        }
      }
    }

    const activeStars = this.state.stars.filter(s => s.active).length;
    if (activeStars < 2) this.spawnStars(STAR_MAX_COUNT - activeStars);
  }

  private cutKite(cutter: PlayerSchema, victim: PlayerSchema, position: { x: number; y: number }) {
    victim.kite.alive = false;
    cutter.score += SCORE_KITE_CUT;
    this.broadcast(MessageType.KITE_CUT, { cutterId: cutter.id, victimId: victim.id, position });
    setTimeout(() => {
      victim.kite.alive = true;
      victim.kite.position.x = victim.anchorPosition.x;
      victim.kite.position.y = WORLD_HEIGHT * 0.65;
      victim.kite.velocity.x = 0;
      victim.kite.velocity.y = 0;
    }, 3000);
  }

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
