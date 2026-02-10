// ============================================
// PATANG BAZI — Kite Physics Engine
// This module runs on BOTH client and server.
// It must be 100% deterministic given the same
// inputs and state. No randomness, no Date.now().
// ============================================

import {
  KITE_GRAVITY,
  KITE_PULL_FORCE,
  KITE_STEER_FORCE,
  KITE_AIR_RESISTANCE,
  KITE_MAX_SPEED,
  KITE_MAX_LINE_LENGTH,
  KITE_HITBOX_RADIUS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  CEILING_Y,
  BOUNDARY_MARGIN,
  WIND_FORCE_MULTIPLIER,
  WIND_GUST_AMPLITUDE,
  PENCH_CROSS_DISTANCE,
  GROUND_Y,
} from '../constants/index.js';

import type {
  Vec2,
  KiteState,
  WindState,
  PlayerInput,
  StarState,
} from '../types/index.js';

// --- Vector Helpers ---
export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function vec2Dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function vec2Len(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vec2Normalize(v: Vec2): Vec2 {
  const len = vec2Len(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

// --- Kite Physics Step ---
export interface KiteUpdateResult {
  kite: KiteState;
  /** Stars collected this tick (by id) */
  collectedStars: string[];
}

/**
 * Advance one kite by one fixed timestep.
 * Pure function — no side effects, fully deterministic.
 */
export function stepKite(
  kite: KiteState,
  anchor: Vec2,
  input: PlayerInput,
  wind: WindState,
  stars: StarState[],
  gameTime: number,
  dt: number,
): KiteUpdateResult {
  if (!kite.alive) {
    return { kite: { ...kite }, collectedStars: [] };
  }

  let { x: px, y: py } = kite.position;
  let { x: vx, y: vy } = kite.velocity;
  let angle = kite.angle;
  let tailPhase = kite.tailPhase;

  const dtScale = dt * 60; // Normalize to 60fps baseline

  // --- Gravity ---
  vy += KITE_GRAVITY * dtScale;

  // --- Pull (string tension → upward) ---
  if (input.pull) {
    vy += KITE_PULL_FORCE * dtScale;
    // Subtle bob when pulling
    vy += Math.sin(gameTime * 8) * 0.05;
  }

  // --- Steering ---
  if (input.steer < 0) vx -= KITE_STEER_FORCE * dtScale;
  if (input.steer > 0) vx += KITE_STEER_FORCE * dtScale;

  // --- Wind ---
  const windForce = wind.speed * wind.direction * WIND_FORCE_MULTIPLIER;
  const windGust = Math.sin(gameTime * 1.2) * WIND_GUST_AMPLITUDE * wind.speed;
  vx += (windForce + windGust) * dtScale;

  // --- Natural wobble (more at height) ---
  const heightRatio = 1 - py / WORLD_HEIGHT;
  vx += Math.sin(gameTime * 2.5) * 0.03 * heightRatio;
  vy += Math.cos(gameTime * 1.8) * 0.02 * heightRatio;

  // --- Air resistance ---
  vx *= KITE_AIR_RESISTANCE;
  vy *= KITE_AIR_RESISTANCE;

  // --- Speed cap ---
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > KITE_MAX_SPEED) {
    const scale = KITE_MAX_SPEED / speed;
    vx *= scale;
    vy *= scale;
  }

  // --- Integrate position ---
  px += vx * dtScale;
  py += vy * dtScale;

  // --- Line length constraint ---
  const dx = px - anchor.x;
  const dy = py - anchor.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > KITE_MAX_LINE_LENGTH) {
    const nx = dx / dist;
    const ny = dy / dist;
    px = anchor.x + nx * KITE_MAX_LINE_LENGTH;
    py = anchor.y + ny * KITE_MAX_LINE_LENGTH;
    // Remove outward velocity component
    const dot = vx * nx + vy * ny;
    if (dot > 0) {
      vx -= dot * nx * 0.5;
      vy -= dot * ny * 0.5;
    }
  }

  // --- Boundaries ---
  if (px < BOUNDARY_MARGIN) {
    px = BOUNDARY_MARGIN;
    vx = Math.abs(vx) * 0.3;
  }
  if (px > WORLD_WIDTH - BOUNDARY_MARGIN) {
    px = WORLD_WIDTH - BOUNDARY_MARGIN;
    vx = -Math.abs(vx) * 0.3;
  }
  if (py < CEILING_Y) {
    py = CEILING_Y;
    vy = Math.abs(vy) * 0.3;
  }
  if (py > GROUND_Y - 30) {
    py = GROUND_Y - 30;
    vy = -Math.abs(vy) * 0.2;
  }

  // --- Visual angle ---
  const targetAngle = vx * 3.5;
  angle += (targetAngle - angle) * 0.08;

  // --- Tail phase ---
  tailPhase += dt * 5;

  // --- Star collection ---
  const collectedStars: string[] = [];
  for (const star of stars) {
    if (!star.active) continue;
    const sdist = vec2Dist({ x: px, y: py }, star.position);
    if (sdist < KITE_HITBOX_RADIUS + star.size) {
      collectedStars.push(star.id);
    }
  }

  return {
    kite: {
      position: { x: px, y: py },
      velocity: { x: vx, y: vy },
      angle,
      tailPhase,
      alive: true,
    },
    collectedStars,
  };
}

// --- String-to-String Intersection (Pench Detection) ---

/**
 * Approximate check: do two kite strings come close enough
 * to initiate a pench (string crossing battle)?
 *
 * We sample points along each catenary and check minimum distance.
 */
export function checkPench(
  kiteA: KiteState,
  anchorA: Vec2,
  kiteB: KiteState,
  anchorB: Vec2,
): { crossing: boolean; position: Vec2 } {
  const samples = 10;
  let minDist = Infinity;
  let closestPos: Vec2 = { x: 0, y: 0 };

  for (let i = 1; i < samples; i++) {
    const tA = i / samples;
    const ptA = sampleStringPoint(kiteA.position, anchorA, tA);

    for (let j = 1; j < samples; j++) {
      const tB = j / samples;
      const ptB = sampleStringPoint(kiteB.position, anchorB, tB);

      const d = vec2Dist(ptA, ptB);
      if (d < minDist) {
        minDist = d;
        closestPos = {
          x: (ptA.x + ptB.x) / 2,
          y: (ptA.y + ptB.y) / 2,
        };
      }
    }
  }

  return {
    crossing: minDist < PENCH_CROSS_DISTANCE,
    position: closestPos,
  };
}

/** Sample a point along the kite string (with catenary sag) */
function sampleStringPoint(kitePos: Vec2, anchor: Vec2, t: number): Vec2 {
  const lx = anchor.x + (kitePos.x - anchor.x) * t;
  const ly = anchor.y + (kitePos.y - anchor.y) * t;
  const sag = Math.sin(t * Math.PI) * 20 * (1 - t * 0.5);
  return { x: lx, y: ly + sag };
}

// --- Interpolation (client-side rendering) ---
export function lerpKite(a: KiteState, b: KiteState, t: number): KiteState {
  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * t,
      y: a.position.y + (b.position.y - a.position.y) * t,
    },
    velocity: {
      x: a.velocity.x + (b.velocity.x - a.velocity.x) * t,
      y: a.velocity.y + (b.velocity.y - a.velocity.y) * t,
    },
    angle: a.angle + (b.angle - a.angle) * t,
    tailPhase: b.tailPhase, // Don't interpolate phase
    alive: b.alive,
  };
}
