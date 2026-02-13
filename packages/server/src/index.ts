// ============================================
// PATANG BAZI — Game Server
// Colyseus server with Express
// ============================================

import colyseus from 'colyseus';
import wsTransport from '@colyseus/ws-transport';
import colyseusMonitor from '@colyseus/monitor';
import express from 'express';
import http from 'http';

const { Server } = colyseus;
const { WebSocketTransport } = wsTransport;
const { monitor } = colyseusMonitor;
import { PatangRoom } from './rooms/PatangRoom.js';
import { ROOM_NAME } from '@patang/shared';
import apiRoutes from './api/routes.js';

const PORT = Number(process.env.PORT) || 2567;

async function main() {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // API endpoints
  app.use('/api', apiRoutes);

  if (process.env.NODE_ENV !== 'production') {
    app.use('/monitor', monitor());
  }

  const server = http.createServer(app);

  const gameServer = new Server({
    transport: new WebSocketTransport({ server }),
  });

  gameServer.define(ROOM_NAME, PatangRoom)
    .filterBy(['roomCode']);

  gameServer.listen(PORT);

  console.log(`🪁 Patang Bazi Server`);
  console.log(`   → WebSocket: ws://localhost:${PORT}`);
  console.log(`   → API:       http://localhost:${PORT}/api/rooms`);
  console.log(`   → Monitor:   http://localhost:${PORT}/monitor`);
  console.log(`   → Health:    http://localhost:${PORT}/health`);
}

main().catch(console.error);
