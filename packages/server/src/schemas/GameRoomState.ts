// ============================================
// PATANG BAZI — Colyseus State Schema
// ============================================

import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export class Vec2Schema extends Schema {
  @type('float32') x: number = 0;
  @type('float32') y: number = 0;
}

export class KiteSchema extends Schema {
  @type(Vec2Schema) position = new Vec2Schema();
  @type(Vec2Schema) velocity = new Vec2Schema();
  @type('float32') angle: number = 0;
  @type('float32') tailPhase: number = 0;
  @type('boolean') alive: boolean = true;
}

export class PlayerSchema extends Schema {
  @type('string') id: string = '';
  @type('string') name: string = '';
  @type('uint8') colorIndex: number = 0;
  @type(KiteSchema) kite = new KiteSchema();
  @type(Vec2Schema) anchorPosition = new Vec2Schema();
  @type('int32') score: number = 0;
  @type('uint32') lastProcessedInput: number = 0;
  @type('boolean') connected: boolean = true;
  @type('boolean') ready: boolean = false;
}

export class StarSchema extends Schema {
  @type('string') id: string = '';
  @type(Vec2Schema) position = new Vec2Schema();
  @type('float32') size: number = 16;
  @type('boolean') active: boolean = true;
}

export class WindSchema extends Schema {
  @type('float32') speed: number = 1;
  @type('int8') direction: number = 1;
  @type('float32') changeTimer: number = 5;
}

export class PenchSchema extends Schema {
  @type('string') id: string = '';           // "playerA_playerB"
  @type('string') playerAId: string = '';
  @type('string') playerBId: string = '';
  @type('float32') progress: number = 0;    // 0 → 1, at 1 string is cut
  @type(Vec2Schema) position = new Vec2Schema();
  @type('boolean') active: boolean = true;
  @type('string') winnerId: string = '';     // who's winning (pulling harder)
}

export class GameRoomState extends Schema {
  @type('string') phase: string = 'waiting';
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type(WindSchema) wind = new WindSchema();
  @type([StarSchema]) stars = new ArraySchema<StarSchema>();
  @type([PenchSchema]) penches = new ArraySchema<PenchSchema>();
  @type('uint32') tick: number = 0;
  @type('float32') timeRemaining: number = 180;
  @type('uint8') countdown: number = 0;
}
