// ============================================
// PATANG BAZI — Shared Types
// These types are the contract between
// client and server. Change carefully!
// ============================================

// --- Math ---
export interface Vec2 {
  x: number;
  y: number;
}

// --- Player Input (Client → Server) ---
export interface PlayerInput {
  /** Sequence number for reconciliation */
  seq: number;
  /** Timestamp when input was created */
  timestamp: number;
  /** Is the player pulling the string? */
  pull: boolean;
  /** Steering: -1 left, 0 none, 1 right */
  steer: number;
}

// --- Kite State ---
export interface KiteState {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  tailPhase: number;
  /** Is the kite still flying? */
  alive: boolean;
}

// --- Wind State ---
export interface WindState {
  speed: number;
  /** 1 = right, -1 = left */
  direction: number;
  changeTimer: number;
}

// --- Star Collectible ---
export interface StarState {
  id: string;
  position: Vec2;
  size: number;
  active: boolean;
}

// --- Player State (Server → Client) ---
export interface PlayerState {
  id: string;
  name: string;
  colorIndex: number;
  kite: KiteState;
  anchorPosition: Vec2;
  score: number;
  /** Last processed input sequence number */
  lastProcessedInput: number;
  /** Is this player connected? */
  connected: boolean;
}

// --- Room/Game State ---
export type GamePhase = 'waiting' | 'countdown' | 'playing' | 'finished';

export interface GameState {
  phase: GamePhase;
  players: Record<string, PlayerState>;
  wind: WindState;
  stars: StarState[];
  /** Server tick number */
  tick: number;
  /** Time remaining in seconds (for timed matches) */
  timeRemaining: number;
  /** Countdown seconds before match start */
  countdown: number;
}

// --- Pench (String Crossing) Event ---
export interface PenchEvent {
  attackerId: string;
  defenderId: string;
  progress: number;   // 0 to 1, at 1 the string is cut
  position: Vec2;      // Where strings are crossing
}

// --- Network Messages ---
export enum MessageType {
  // Client → Server
  INPUT = 'input',
  PLAYER_READY = 'player_ready',
  REQUEST_REMATCH = 'request_rematch',

  // Server → Client
  STATE_UPDATE = 'state_update',
  STAR_COLLECTED = 'star_collected',
  KITE_CUT = 'kite_cut',
  PENCH_START = 'pench_start',
  PENCH_UPDATE = 'pench_update',
  PENCH_END = 'pench_end',
  GAME_OVER = 'game_over',
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',
}

// --- Client → Server Messages ---
export interface InputMessage {
  type: MessageType.INPUT;
  input: PlayerInput;
}

export interface PlayerReadyMessage {
  type: MessageType.PLAYER_READY;
  name: string;
}

// --- Server → Client Messages ---
export interface StateUpdateMessage {
  type: MessageType.STATE_UPDATE;
  state: GameState;
  /** Server timestamp for latency calculation */
  serverTime: number;
}

export interface StarCollectedMessage {
  type: MessageType.STAR_COLLECTED;
  starId: string;
  playerId: string;
  newScore: number;
}

export interface KiteCutMessage {
  type: MessageType.KITE_CUT;
  cutterId: string;
  victimId: string;
  position: Vec2;
}

export interface GameOverMessage {
  type: MessageType.GAME_OVER;
  rankings: Array<{
    playerId: string;
    name: string;
    score: number;
    kiteCuts: number;
  }>;
}

export interface PlayerJoinedMessage {
  playerId: string;
  name: string;
  colorIndex: number;
  /** True if player joined while game was already running */
  hotJoin: boolean;
}

export interface PlayerLeftMessage {
  playerId: string;
  name: string;
}

// --- Join Options ---
export interface RoomJoinOptions {
  name: string;
  roomCode?: string;  // For private rooms
}
