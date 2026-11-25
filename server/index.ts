import cors from 'cors';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { JoinSessionResponse, RoomConfig } from '../shared/types';
import { RoomManager } from './RoomManager';

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'IPL Auction Server Running' });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager({
  onStateChange: (roomCode, state) => {
    io.to(roomCode).emit('stateUpdate', state);
  },
  onReaction: (roomCode, reaction) => {
    io.to(roomCode).emit('floatingReaction', reaction);
  },
});

io.on('connection', (socket) => {
  socket.on(
    'createRoom',
    (
      payload: {
        displayName: string;
        config?: Partial<RoomConfig>;
        preferredTeamId?: string;
      },
      ack?: (res: JoinSessionResponse) => void
    ) => {
      const { engine, session } = roomManager.createRoom(
        payload.displayName,
        payload.config,
        socket.id
      );

      if (payload.preferredTeamId) {
        engine.assignHumanToTeam(
          payload.preferredTeamId,
          session.playerToken,
          session.displayName
        );
      }

      socket.join(engine.roomCode);
      const assigned = engine.getTeamByToken(session.playerToken);

      ack?.({
        ok: true,
        roomCode: engine.roomCode,
        playerToken: session.playerToken,
        assignedTeamId: assigned?.franchise.id ?? null,
        state: engine.getPublicState(),
      });
    }
  );

  socket.on(
    'joinRoom',
    (
      payload: { roomCode: string; displayName: string },
      ack?: (res: JoinSessionResponse) => void
    ) => {
      const joined = roomManager.joinRoom(
        payload.roomCode,
        payload.displayName,
        socket.id
      );
      if (!joined.ok) {
        ack?.({ ok: false, error: joined.error });
        return;
      }

      const { engine, session } = joined;
      socket.join(engine.roomCode);
      engine.addSystemMessage(`${session.displayName} joined the room.`);
      io.to(engine.roomCode).emit('stateUpdate', engine.getPublicState());

      ack?.({
        ok: true,
        roomCode: engine.roomCode,
        playerToken: session.playerToken,
        assignedTeamId: null,
        state: engine.getPublicState(),
      });
    }
  );

  socket.on(
    'rejoinSession',
    (
      payload: { roomCode: string; playerToken: string },
      ack?: (res: JoinSessionResponse) => void
    ) => {
      const result = roomManager.reconnectSession(
        payload.roomCode,
        payload.playerToken,
        socket.id
      );
      if (!result) {
        ack?.({ ok: false, error: 'Session expired or room closed' });
        return;
      }

      const { engine, session } = result;
      socket.join(engine.roomCode);
      const assigned = engine.getTeamByToken(session.playerToken);
      io.to(engine.roomCode).emit('stateUpdate', engine.getPublicState());

      ack?.({
        ok: true,
        roomCode: engine.roomCode,
        playerToken: session.playerToken,
        assignedTeamId: assigned?.franchise.id ?? null,
        state: engine.getPublicState(),
      });
    }
  );

  socket.on(
    'selectTeam',
    (payload: { teamId: string }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const session = roomManager.getSessionBySocket(socket.id);
      if (!session) return ack?.({ ok: false, error: 'No active session' });
      const engine = roomManager.getRoom(session.roomCode);
      if (!engine) return ack?.({ ok: false, error: 'Room not found' });

      const ok = engine.assignHumanToTeam(
        payload.teamId,
        session.playerToken,
        session.displayName
      );
      ack?.(ok ? { ok: true } : { ok: false, error: 'Team unavailable' });
    }
  );

  socket.on('updateConfig', (payload: Partial<RoomConfig>) => {
    const session = roomManager.getSessionBySocket(socket.id);
    if (!session) return;
    const engine = roomManager.getRoom(session.roomCode);
    if (!engine || engine.hostToken !== session.playerToken) return;
    engine.updateConfig(payload);
  });

  socket.on('startAuction', () => {
    const session = roomManager.getSessionBySocket(socket.id);
    if (!session) return;
    const engine = roomManager.getRoom(session.roomCode);
    if (!engine || engine.hostToken !== session.playerToken) return;
    engine.startAuction();
  });

  socket.on(
    'submitRetentions',
    (payload: { playerIds: string[] }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const session = roomManager.getSessionBySocket(socket.id);
      if (!session) return ack?.({ ok: false, error: 'No active session' });
      const engine = roomManager.getRoom(session.roomCode);
      if (!engine) return ack?.({ ok: false, error: 'Room not found' });
      const team = engine.getTeamByToken(session.playerToken);
      if (!team) return ack?.({ ok: false, error: 'No team assigned' });

      const err = engine.submitHumanRetention(team.franchise.id, payload.playerIds);
      ack?.(err ? { ok: false, error: err } : { ok: true });
    }
  );

  socket.on('forceBeginBidding', () => {
    const session = roomManager.getSessionBySocket(socket.id);
    if (!session) return;
    const engine = roomManager.getRoom(session.roomCode);
    if (!engine || engine.hostToken !== session.playerToken) return;
    engine.beginLiveBidding();
  });

  socket.on(
    'placeBid',
    (
      payload: { amountLakhs?: number },
      ack?: (res: { ok: boolean; error?: string }) => void
    ) => {
      const session = roomManager.getSessionBySocket(socket.id);
      if (!session) return ack?.({ ok: false, error: 'No active session' });
      const engine = roomManager.getRoom(session.roomCode);
      if (!engine) return ack?.({ ok: false, error: 'Room not found' });
      const team = engine.getTeamByToken(session.playerToken);
      if (!team) return ack?.({ ok: false, error: 'Spectators cannot bid' });

      const err = engine.placeBid(team.franchise.id, payload?.amountLakhs, false);
      ack?.(err ? { ok: false, error: err } : { ok: true });
    }
  );

  socket.on(
    'submitRTMCounter',
    (payload: { raiseLakhs: number }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const session = roomManager.getSessionBySocket(socket.id);
      if (!session) return ack?.({ ok: false, error: 'No active session' });
      const engine = roomManager.getRoom(session.roomCode);
      if (!engine) return ack?.({ ok: false, error: 'Room not found' });
      const team = engine.getTeamByToken(session.playerToken);
      if (!team) return ack?.({ ok: false, error: 'No team assigned' });

      const err = engine.submitRTMCounter(team.franchise.id, payload.raiseLakhs);
      ack?.(err ? { ok: false, error: err } : { ok: true });
    }
  );

  socket.on(
    'submitRTMDecision',
    (payload: { useRtm: boolean }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const session = roomManager.getSessionBySocket(socket.id);
      if (!session) return ack?.({ ok: false, error: 'No active session' });
      const engine = roomManager.getRoom(session.roomCode);
      if (!engine) return ack?.({ ok: false, error: 'Room not found' });
      const team = engine.getTeamByToken(session.playerToken);
      if (!team) return ack?.({ ok: false, error: 'No team assigned' });

      const err = engine.resolveRTMDecision(payload.useRtm, team.franchise.id);
      ack?.(err ? { ok: false, error: err } : { ok: true });
    }
  );

  socket.on('hostControl', (payload: { action: 'PAUSE' | 'SKIP' | 'ACCELERATE' | 'SIMULATE' | 'END' }) => {
    const session = roomManager.getSessionBySocket(socket.id);
    if (!session) return;
    const engine = roomManager.getRoom(session.roomCode);
    if (!engine || engine.hostToken !== session.playerToken) return;

    const team = engine.getTeamByToken(session.playerToken);
    if (payload.action === 'PAUSE') engine.togglePause();
    else if (payload.action === 'SKIP') engine.skipCurrentLot(team?.franchise.id);
    else if (payload.action === 'ACCELERATE') engine.triggerAcceleratedRound();
    else if (payload.action === 'SIMULATE') engine.simulateRemainingAuction();
    else if (payload.action === 'END') engine.completeAuction();
  });

  socket.on('simulateSeason', () => {
    const session = roomManager.getSessionBySocket(socket.id);
    if (!session) return;
    const engine = roomManager.getRoom(session.roomCode);
    if (!engine) return;
    engine.simulateSeason();
  });

  socket.on(
    'setLeadership',
    (
      payload: {
        captainId?: string | null;
        viceCaptainId?: string | null;
        wicketkeeperId?: string | null;
      },
      ack?: (res: { ok: boolean; error?: string }) => void
    ) => {
      const session = roomManager.getSessionBySocket(socket.id);
      if (!session) return ack?.({ ok: false, error: 'No active session' });
      const engine = roomManager.getRoom(session.roomCode);
      if (!engine) return ack?.({ ok: false, error: 'Room not found' });
      const team = engine.getTeamByToken(session.playerToken);
      if (!team) return ack?.({ ok: false, error: 'No team assigned' });

      const err = engine.setLeadership(
        team.franchise.id,
        payload?.captainId,
        payload?.viceCaptainId,
        payload?.wicketkeeperId
      );
      ack?.(err ? { ok: false, error: err } : { ok: true });
    }
  );

  socket.on('sendChat', (payload: { text: string }) => {
    const session = roomManager.getSessionBySocket(socket.id);
    if (!session) return;
    const engine = roomManager.getRoom(session.roomCode);
    if (!engine) return;
    const team = engine.getTeamByToken(session.playerToken);
    engine.addChatMessage(
      session.displayName,
      team?.franchise.shortName ?? null,
      payload.text
    );
  });

  socket.on('sendReaction', (payload: { emoji: string }) => {
    const session = roomManager.getSessionBySocket(socket.id);
    if (!session) return;
    const engine = roomManager.getRoom(session.roomCode);
    if (!engine) return;
    engine.triggerReaction(payload.emoji, session.displayName);
  });

  socket.on('leaveRoom', (ack?: (res: { ok: boolean }) => void) => {
    const session = roomManager.getSessionBySocket(socket.id);
    if (session) {
      socket.leave(session.roomCode);
      roomManager.leaveRoom(socket.id);
    }
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    roomManager.handleDisconnect(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`IPL Auction Server listening on port ${PORT}`);
});
