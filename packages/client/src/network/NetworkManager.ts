// ============================================
// PATANG BAZI — Network Manager
// Colyseus schema state sync + input sending
// Lightweight: server state auto-syncs via schema
// ============================================

import { Client, Room } from 'colyseus.js';
import {
  ROOM_NAME,
  MessageType,
  type PlayerInput,
  type RoomJoinOptions,
  type StarCollectedMessage,
  type KiteCutMessage,
  type GameOverMessage,
} from '@patang/shared';

type Callback = (...args: any[]) => void;

export class NetworkManager {
  private client: Client | null = null;
  private _room: Room<any> | null = null;
  private listeners = new Map<string, Set<Callback>>();
  private pendingInputs: PlayerInput[] = [];

  // --- Connection ---

  async connect(serverUrl: string, options: RoomJoinOptions): Promise<string> {
    // Always disconnect cleanly before reconnecting
    await this.disconnect();

    this.client = new Client(serverUrl);

    if (options.roomCode) {
      this._room = await this.client.joinById(options.roomCode, options);
    } else {
      this._room = await this.client.joinOrCreate(ROOM_NAME, options);
    }

    this.pendingInputs = [];
    this.setupRoomListeners();
    console.log(`🌐 Connected: room=${this._room.id} session=${this._room.sessionId}`);
    this.emit('connected', this._room.sessionId);
    return this._room.sessionId;
  }

  async disconnect() {
    if (this._room) {
      try {
        await this._room.leave(true); // consented leave
      } catch {
        // Room may already be gone
      }
      this._room = null;
    }
    this.pendingInputs = [];
  }

  /** Clear all event listeners (call between games) */
  removeAllListeners() {
    this.listeners.clear();
  }

  get room(): Room<any> | null { return this._room; }
  get isConnected(): boolean { return this._room !== null; }
  get sessionId(): string | null { return this._room?.sessionId ?? null; }
  get roomId(): string | null { return this._room?.id ?? null; }

  /** Direct access to auto-synced server state */
  get state(): any | null { return this._room?.state ?? null; }

  // --- Send ---

  sendInput(input: PlayerInput) {
    if (!this._room) return;
    this.pendingInputs.push(input);
    // Cap pending inputs to prevent memory growth during network stalls
    if (this.pendingInputs.length > 120) {
      this.pendingInputs = this.pendingInputs.slice(-60);
    }
    this._room.send(MessageType.INPUT, input);
  }

  sendReady(name: string) {
    this._room?.send(MessageType.PLAYER_READY, { name });
  }

  /** Get inputs server hasn't processed yet (for reconciliation) */
  getPendingInputs(lastProcessedSeq: number): PlayerInput[] {
    this.pendingInputs = this.pendingInputs.filter(i => i.seq > lastProcessedSeq);
    return this.pendingInputs;
  }

  // --- Room Listeners (on the Colyseus room object) ---

  private setupRoomListeners() {
    if (!this._room) return;

    // Game events via messages
    this._room.onMessage(MessageType.STAR_COLLECTED, (msg: StarCollectedMessage) => {
      this.emit('starCollected', msg);
    });

    this._room.onMessage(MessageType.KITE_CUT, (msg: KiteCutMessage) => {
      this.emit('kiteCut', msg);
    });

    this._room.onMessage(MessageType.PENCH_START, (msg: any) => {
      this.emit('penchStart', msg);
    });

    this._room.onMessage(MessageType.PENCH_UPDATE, (msg: any) => {
      this.emit('penchUpdate', msg);
    });

    this._room.onMessage(MessageType.PENCH_END, (msg: any) => {
      this.emit('penchEnd', msg);
    });

    this._room.onMessage(MessageType.GAME_OVER, (msg: GameOverMessage) => {
      this.emit('gameOver', msg);
    });

    this._room.onMessage(MessageType.PLAYER_JOINED, (msg: any) => {
      this.emit('playerJoined', msg);
    });

    this._room.onMessage(MessageType.PLAYER_LEFT, (msg: any) => {
      this.emit('playerLeft', msg);
    });

    this._room.onError((code, message) => {
      console.error(`Room error [${code}]: ${message}`);
      this.emit('error', new Error(`[${code}] ${message}`));
    });

    this._room.onLeave((code) => {
      console.log(`Left room (code: ${code})`);
      this._room = null;
      this.emit('disconnected');
    });
  }

  // --- Event Emitter ---

  on(event: string, cb: Callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  off(event: string, cb: Callback) {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, ...args: unknown[]) {
    const cbs = this.listeners.get(event);
    if (cbs) for (const cb of cbs) cb(...args);
  }
}
