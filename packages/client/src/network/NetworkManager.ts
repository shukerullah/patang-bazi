// ============================================
// PATANG BAZI — Network Manager
// Handles Colyseus connection, state sync,
// client-side prediction, and server reconciliation
// ============================================

import { Client, Room } from 'colyseus.js';
import {
  ROOM_NAME,
  MessageType,
  type PlayerInput,
  type GameState,
  type StateUpdateMessage,
  type StarCollectedMessage,
  type KiteCutMessage,
  type GameOverMessage,
  type RoomJoinOptions,
} from '@patang/shared';

export type NetworkEventMap = {
  stateUpdate: (state: GameState) => void;
  starCollected: (msg: StarCollectedMessage) => void;
  kiteCut: (msg: KiteCutMessage) => void;
  gameOver: (msg: GameOverMessage) => void;
  connected: (playerId: string) => void;
  disconnected: () => void;
  error: (err: Error) => void;
};

export class NetworkManager {
  private client: Client | null = null;
  private room: Room | null = null;
  private listeners = new Map<string, Set<Function>>();

  // Input buffer for reconciliation
  private pendingInputs: PlayerInput[] = [];

  // Latency tracking
  private latency = 0;
  private lastPingTime = 0;

  // --- Connection ---

  async connect(serverUrl: string, options: RoomJoinOptions): Promise<string> {
    try {
      this.client = new Client(serverUrl);

      // Try to join existing room, or create new
      if (options.roomCode) {
        this.room = await this.client.joinById(options.roomCode, options);
      } else {
        this.room = await this.client.joinOrCreate(ROOM_NAME, options);
      }

      this.setupRoomListeners();

      console.log(`🌐 Connected to room: ${this.room.id} as ${this.room.sessionId}`);
      this.emit('connected', this.room.sessionId);

      return this.room.sessionId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.room) {
      await this.room.leave();
      this.room = null;
    }
    this.emit('disconnected');
  }

  get isConnected(): boolean {
    return this.room !== null;
  }

  get roomId(): string | null {
    return this.room?.id ?? null;
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get currentLatency(): number {
    return this.latency;
  }

  // --- Send Input ---

  sendInput(input: PlayerInput) {
    if (!this.room) return;

    // Store for reconciliation
    this.pendingInputs.push(input);

    // Send to server
    this.room.send(MessageType.INPUT, input);
  }

  sendReady(name: string) {
    if (!this.room) return;
    this.room.send(MessageType.PLAYER_READY, { name });
  }

  sendRematchRequest() {
    if (!this.room) return;
    this.room.send(MessageType.REQUEST_REMATCH, {});
  }

  // --- Reconciliation ---

  /**
   * After receiving a server state update, discard inputs
   * the server has already processed and return remaining
   * pending inputs to re-simulate.
   */
  getPendingInputs(lastProcessedSeq: number): PlayerInput[] {
    // Remove all inputs up to and including lastProcessedSeq
    this.pendingInputs = this.pendingInputs.filter(
      (input) => input.seq > lastProcessedSeq
    );
    return this.pendingInputs;
  }

  // --- Room Listeners ---

  private setupRoomListeners() {
    if (!this.room) return;

    this.room.onMessage(MessageType.STATE_UPDATE, (msg: StateUpdateMessage) => {
      // Calculate latency
      this.latency = (performance.now() - this.lastPingTime) / 2;
      this.emit('stateUpdate', msg.state);
    });

    this.room.onMessage(MessageType.STAR_COLLECTED, (msg: StarCollectedMessage) => {
      this.emit('starCollected', msg);
    });

    this.room.onMessage(MessageType.KITE_CUT, (msg: KiteCutMessage) => {
      this.emit('kiteCut', msg);
    });

    this.room.onMessage(MessageType.GAME_OVER, (msg: GameOverMessage) => {
      this.emit('gameOver', msg);
    });

    this.room.onError((code, message) => {
      console.error(`Room error [${code}]: ${message}`);
      this.emit('error', new Error(`Room error [${code}]: ${message}`));
    });

    this.room.onLeave((code) => {
      console.log(`Left room (code: ${code})`);
      this.emit('disconnected');
    });
  }

  // --- Ping ---

  ping() {
    this.lastPingTime = performance.now();
    // Latency calculated when state update arrives
  }

  // --- Event System ---

  on<K extends keyof NetworkEventMap>(event: K, callback: NetworkEventMap[K]) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<K extends keyof NetworkEventMap>(event: K, callback: NetworkEventMap[K]) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: unknown[]) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        (cb as Function)(...args);
      }
    }
  }
}
