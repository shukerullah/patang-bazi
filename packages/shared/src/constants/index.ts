// ============================================
// PATANG BAZI — Game Constants
// Shared across client & server
// ============================================

// --- Game Info ---
export const GAME_VERSION = '0.3.0-alpha';

// --- Simulation ---
export const TICK_RATE = 60;                   // Physics ticks per second
export const SERVER_SEND_RATE = 20;            // Network updates per second
export const FIXED_DT = 1 / TICK_RATE;        // Fixed timestep (seconds)

// --- World ---
export const WORLD_WIDTH = 1920;               // Logical world width
export const WORLD_HEIGHT = 1080;              // Logical world height
export const GROUND_Y = WORLD_HEIGHT * 0.90;   // Ground level
export const CEILING_Y = 30;                   // Sky ceiling
export const BOUNDARY_MARGIN = 40;             // Edge buffer

// --- Kite Physics ---
export const KITE_GRAVITY = 0.35;
export const KITE_PULL_FORCE = -1.4;           // Upward force when pulling
export const KITE_STEER_FORCE = 0.7;
export const KITE_AIR_RESISTANCE = 0.985;
export const KITE_MAX_SPEED = 6;
export const KITE_MAX_LINE_LENGTH = WORLD_HEIGHT * 0.85;
export const KITE_HITBOX_RADIUS = 28;

// --- Wind ---
export const WIND_MIN_SPEED = 0.3;
export const WIND_MAX_SPEED = 1.5;
export const WIND_CHANGE_MIN_TIME = 3;         // Min seconds between wind shifts
export const WIND_CHANGE_MAX_TIME = 8;         // Max seconds between wind shifts
export const WIND_FORCE_MULTIPLIER = 0.12;
export const WIND_GUST_AMPLITUDE = 0.08;

// --- Stars (Collectibles) ---
export const STAR_SPAWN_DELAY_MIN = 1000;      // ms
export const STAR_SPAWN_DELAY_MAX = 5000;      // ms
export const STAR_MIN_SIZE = 12;
export const STAR_MAX_SIZE = 22;
export const STAR_POINTS = 10;
export const STAR_MAX_COUNT = 6;
export const STAR_LIFETIME_MIN = 8;            // Min seconds before despawn
export const STAR_LIFETIME_MAX = 15;           // Max seconds (randomized per star)

// --- Multiplayer ---
export const MAX_PLAYERS_PER_ROOM = 5;
export const ROOM_NAME = 'patang_room';
export const DISCONNECT_TIMEOUT = 5;           // Seconds before disconnected player is removed
export const PLAYER_COLORS = [
  { primary: '#e8403a', secondary: '#f4b942', name: 'Red-Gold' },
  { primary: '#3d8bfd', secondary: '#42f4e8', name: 'Blue-Cyan' },
  { primary: '#9b59b6', secondary: '#f39c12', name: 'Purple-Orange' },
  { primary: '#2ecc71', secondary: '#e74c3c', name: 'Green-Red' },
  { primary: '#e67e22', secondary: '#1abc9c', name: 'Amber-Teal' },
] as const;

// --- String Rendering ---
export const STRING_SAG_PULL = 8;              // Catenary sag when pulling
export const STRING_SAG_GLIDE = 25;            // Catenary sag when gliding
export const STRING_SAG_PENCH = 20;            // Sag used for pench detection (server-side average)

// --- String Fighting (Pench) ---
export const PENCH_CROSS_DISTANCE = 35;        // How close strings must be
export const PENCH_DURATION = 2.0;             // Seconds of contact to cut
export const PENCH_TENSION_FACTOR = 0.3;       // Pull strength affects cut speed

// --- Scoring ---
export const SCORE_KITE_CUT = 50;

// --- Game Rules ---
export const ROUND_DURATION = 180;               // Seconds per round
export const MIN_PLAYERS_TO_START = 2;           // Minimum players to begin countdown
export const COUNTDOWN_SECONDS = 3;              // Countdown before round starts
export const KITE_RESPAWN_DELAY = 3000;          // ms before cut kite respawns
export const INSTRUCTION_DISPLAY_DELAY = 5000;   // How long to show in-game tutorial

// --- Bot ---
export const BOT_SPAWN_DELAY = 15000;            // ms waiting alone before bot joins
export const BOT_NAME_POOL = [
  'Ustaad', 'Patangbaaz', 'Dorbaaz', 'Shikari', 'Hawker',
  'Sultan', 'Pilot', 'Falcon', 'Baaz', 'Cheel',
  'Shehbaz', 'Teetar', 'Shaheen', 'Kargas', 'Bulbul',
] as const;
