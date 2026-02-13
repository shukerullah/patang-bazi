// ============================================
// PATANG BAZI — API Routes
// Lightweight REST endpoints for game stats
// ============================================

import { Router } from 'express';
import colyseus from 'colyseus';
const { matchMaker } = colyseus;
import { ROOM_NAME } from '@patang/shared';

const router = Router();

/**
 * GET /api/rooms
 * Returns active rooms with player counts.
 * Zero cost — just queries Colyseus in-memory room list.
 */
router.get('/rooms', async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: ROOM_NAME });

    const roomList = rooms.map((r: any) => ({
      roomId: r.roomId,
      players: r.clients,
      maxPlayers: r.maxClients,
      metadata: r.metadata ?? {},
      locked: r.locked,
      createdAt: r.createdAt,
    }));

    const totalPlayers = roomList.reduce((sum: number, r: any) => sum + r.players, 0);

    res.json({
      rooms: roomList,
      totalRooms: roomList.length,
      totalPlayers,
    });
  } catch (err) {
    console.error('API /rooms error:', err);
    res.status(500).json({ error: 'Failed to query rooms' });
  }
});

export default router;
