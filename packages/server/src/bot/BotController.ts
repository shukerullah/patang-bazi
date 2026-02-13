// ============================================
// PATANG BAZI — Bot Controller
// Simple rule-based AI that mimics a casual
// human player. No ML, just rules + jitter.
// ============================================

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  KITE_MAX_LINE_LENGTH,
  type PlayerInput,
} from '@patang/shared';

interface BotWorld {
  kiteX: number;
  kiteY: number;
  kiteAlive: boolean;
  anchorX: number;
  anchorY: number;
  stars: Array<{ x: number; y: number; active: boolean }>;
  opponents: Array<{ kiteX: number; kiteY: number; alive: boolean }>;
  inPench: boolean;      // is this bot in an active pench?
  penchWinning: boolean; // is the bot winning the pench?
}

export class BotController {
  private seq = 0;

  // Current output state
  private pull = false;
  private steer = 0;

  // Altitude hold
  private targetY = WORLD_HEIGHT * 0.35;
  private targetShiftTimer = 0;

  // Wander
  private wanderDir = 1;
  private wanderTimer = 0;

  // Reaction delay: bot queues decisions and applies them after a delay
  private pendingPull: boolean | null = null;
  private pendingSteer: number | null = null;
  private reactionTimer = 0;

  // Pench toggle (simulates human pull/release during fights)
  private penchToggleTimer = 0;

  // Random seed for deterministic-ish but varied behavior
  private rng: () => number;

  constructor(seed = Date.now()) {
    // Simple seeded random (good enough for bot jitter)
    let s = seed;
    this.rng = () => {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      return s / 0x7fffffff;
    };

    // Randomize initial state so bots don't all behave identically
    this.targetY = WORLD_HEIGHT * (0.25 + this.rng() * 0.2);
    this.wanderDir = this.rng() > 0.5 ? 1 : -1;
    this.wanderTimer = 1 + this.rng() * 3;
    this.targetShiftTimer = 2 + this.rng() * 4;
  }

  /** Generate input for this tick. Call once per physics tick. */
  update(dt: number, world: BotWorld): PlayerInput {
    if (!world.kiteAlive) {
      // Dead — do nothing, wait for respawn
      return this.makeInput(false, 0);
    }

    // --- Reaction delay: queue decisions, apply after delay ---
    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      if (this.pendingPull !== null) { this.pull = this.pendingPull; this.pendingPull = null; }
      if (this.pendingSteer !== null) { this.steer = this.pendingSteer; this.pendingSteer = null; }
      this.reactionTimer = 0;
    }

    // --- Shift altitude target periodically ---
    this.targetShiftTimer -= dt;
    if (this.targetShiftTimer <= 0) {
      this.targetY = WORLD_HEIGHT * (0.2 + this.rng() * 0.3);
      this.targetShiftTimer = 3 + this.rng() * 5;
    }

    // --- Decision: Pench (highest priority) ---
    if (world.inPench) {
      this.handlePench(dt, world);
      return this.makeInput(this.pull, this.steer);
    }

    // --- Decision: Star seeking ---
    const starTarget = this.findBestStar(world);
    if (starTarget) {
      this.handleStarSeek(dt, world, starTarget);
      return this.makeInput(this.pull, this.steer);
    }

    // --- Decision: Altitude hold + wander ---
    this.handleAltitudeAndWander(dt, world);

    return this.makeInput(this.pull, this.steer);
  }

  // --- Behaviors ---

  private handlePench(dt: number, world: BotWorld) {
    // During pench: pull aggressively but with human-like toggling
    this.penchToggleTimer -= dt;
    if (this.penchToggleTimer <= 0) {
      // Pull most of the time (70-90%), release briefly to simulate human rhythm
      const pullChance = world.penchWinning ? 0.75 : 0.9;
      this.queueDecision(this.rng() < pullChance, 0, 0.05);
      this.penchToggleTimer = 0.2 + this.rng() * 0.4;
    }

    // Slight random steering during pench (humans jitter)
    if (this.rng() < 0.1) {
      this.queueDecision(null, (this.rng() - 0.5) * 0.6, 0.1);
    }
  }

  private findBestStar(world: BotWorld): { x: number; y: number } | null {
    const stars = world.stars.filter(s => s.active);
    if (stars.length === 0) return null;

    // Filter to stars the kite can actually reach (within line length from anchor)
    // Use 90% of max line length to avoid chasing stars right at the edge
    const maxReach = KITE_MAX_LINE_LENGTH * 0.9;
    const reachable = stars
      .filter(s => {
        const dxAnchor = s.x - world.anchorX;
        const dyAnchor = s.y - world.anchorY;
        return Math.sqrt(dxAnchor * dxAnchor + dyAnchor * dyAnchor) < maxReach;
      })
      .map(s => ({
        ...s,
        dist: Math.sqrt((s.x - world.kiteX) ** 2 + (s.y - world.kiteY) ** 2),
      }))
      .sort((a, b) => a.dist - b.dist);

    if (reachable.length === 0) return null;

    // 30% chance to ignore closest star (pick 2nd if available) — human-like imperfection
    if (reachable.length > 1 && this.rng() < 0.3) {
      return reachable[1];
    }
    return reachable[0];
  }

  private handleStarSeek(_dt: number, world: BotWorld, star: { x: number; y: number }) {
    // Steer toward star
    const dx = star.x - world.kiteX;
    const dy = star.y - world.kiteY;

    // Horizontal: steer left/right
    const steerTarget = dx > 20 ? 1 : dx < -20 ? -1 : 0;

    // Vertical: pull if star is above, release if below
    const pullTarget = dy < -15;

    this.queueDecision(pullTarget, steerTarget, 0.1 + this.rng() * 0.2);
  }

  private handleAltitudeAndWander(dt: number, world: BotWorld) {
    // Altitude: pull if below target, release if above
    const altError = world.kiteY - this.targetY; // positive = too low
    const pullTarget = altError > 30; // only pull when significantly below target

    // Don't pull if very high already (near ceiling)
    const veryHigh = world.kiteY < WORLD_HEIGHT * 0.12;
    this.queueDecision(veryHigh ? false : pullTarget, null, 0.15);

    // Wander: gentle random steering
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderDir = this.rng() > 0.5 ? 1 : -1;
      // Sometimes go straight (0 steer)
      if (this.rng() < 0.25) this.wanderDir = 0;
      this.wanderTimer = 2 + this.rng() * 4;
    }

    // Steer away from edges
    const margin = 150;
    if (world.kiteX < margin) {
      this.queueDecision(null, 1, 0.05);
    } else if (world.kiteX > WORLD_WIDTH - margin) {
      this.queueDecision(null, -1, 0.05);
    } else {
      this.queueDecision(null, this.wanderDir * 0.6, 0.2);
    }
  }

  // --- Helpers ---

  /** Queue a decision with reaction delay (null = keep current) */
  private queueDecision(pull: boolean | null, steer: number | null, minDelay: number) {
    if (this.reactionTimer > 0) return; // already waiting on a decision
    if (pull !== null) this.pendingPull = pull;
    if (steer !== null) this.pendingSteer = steer;
    this.reactionTimer = minDelay + this.rng() * 0.15;
  }

  private makeInput(pull: boolean, steer: number): PlayerInput {
    return {
      seq: ++this.seq,
      timestamp: Date.now(),
      pull,
      steer: Math.max(-1, Math.min(1, steer)),
    };
  }
}
