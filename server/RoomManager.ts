import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_ROOM_CONFIG } from '../shared/constants';
import { RoomConfig } from '../shared/types';
import { AuctionEngine, EngineCallbacks } from './AuctionEngine';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export interface PlayerSession {
  playerToken: string;
  roomCode: string;
  displayName: string;
  socketId: string | null;
  disconnectTimer: NodeJS.Timeout | null;
}

export class RoomManager {
  private rooms: Map<string, AuctionEngine> = new Map();
  private sessions: Map<string, PlayerSession> = new Map();
  private callbacks: EngineCallbacks;

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;

    // Periodic cleanup of idle/completed rooms (> 2 hours idle)
    setInterval(() => {
      const cutoff = Date.now() - 2 * 60 * 60 * 1000;
      for (const [code, engine] of this.rooms.entries()) {
        if (engine.lastActivityAt < cutoff) {
          engine.destroy();
          this.rooms.delete(code);
        }
      }
    }, 10 * 60 * 1000);
  }

  public createRoom(
    displayName: string,
    configOverrides?: Partial<RoomConfig>,
    socketId?: string
  ): { engine: AuctionEngine; session: PlayerSession } {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }

    const hostToken = uuidv4();
    const config: RoomConfig = {
      ...DEFAULT_ROOM_CONFIG,
      ...configOverrides,
    };

    const engine = new AuctionEngine(code, hostToken, config, this.callbacks);
    this.rooms.set(code, engine);

    const session: PlayerSession = {
      playerToken: hostToken,
      roomCode: code,
      displayName: displayName.trim() || 'Host',
      socketId: socketId ?? null,
      disconnectTimer: null,
    };
    this.sessions.set(hostToken, session);

    return { engine, session };
  }

  public getRoom(roomCode: string): AuctionEngine | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  public joinRoom(
    roomCode: string,
    displayName: string,
    socketId: string
  ): { engine: AuctionEngine; session: PlayerSession } | null {
    const engine = this.getRoom(roomCode);
    if (!engine) return null;

    const playerToken = uuidv4();
    const session: PlayerSession = {
      playerToken,
      roomCode: engine.roomCode,
      displayName: displayName.trim() || 'Player',
      socketId,
      disconnectTimer: null,
    };
    this.sessions.set(playerToken, session);
    return { engine, session };
  }

  public reconnectSession(
    roomCode: string,
    playerToken: string,
    socketId: string
  ): { engine: AuctionEngine; session: PlayerSession } | null {
    const engine = this.getRoom(roomCode);
    const session = this.sessions.get(playerToken);
    if (!engine || !session || session.roomCode !== engine.roomCode) {
      return null;
    }

    if (session.disconnectTimer) {
      clearTimeout(session.disconnectTimer);
      session.disconnectTimer = null;
    }
    session.socketId = socketId;

    const team = engine.getTeamByToken(playerToken);
    if (team) {
      team.isConnected = true;
    }

    return { engine, session };
  }

  public getSessionBySocket(socketId: string): PlayerSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.socketId === socketId) return session;
    }
    return undefined;
  }

  public leaveRoom(socketId: string): void {
    const session = this.getSessionBySocket(socketId);
    if (!session) return;

    if (session.disconnectTimer) {
      clearTimeout(session.disconnectTimer);
      session.disconnectTimer = null;
    }
    session.socketId = null;
    this.sessions.delete(session.playerToken);

    const engine = this.getRoom(session.roomCode);
    if (!engine) return;

    const releasedTeam = engine.releaseHumanTeam(session.playerToken);
    this.transferHostIfNeeded(engine, session.playerToken);

    if (releasedTeam) {
      engine.addSystemMessage(
        `${session.displayName} exited the room. ${releasedTeam.franchise.shortName} is now managed by AI Bot.`
      );
    } else {
      engine.addSystemMessage(`${session.displayName} exited the room.`);
    }
    this.callbacks.onStateChange(engine.roomCode, engine.getPublicState());
  }

  private transferHostIfNeeded(engine: AuctionEngine, departingToken: string): void {
    if (engine.hostToken !== departingToken) return;
    const nextHuman = Object.values(engine.teams).find(
      (t) =>
        t.ownerType === 'HUMAN' &&
        t.isConnected &&
        t.playerToken &&
        t.playerToken !== departingToken
    );
    if (nextHuman && nextHuman.playerToken) {
      engine.hostToken = nextHuman.playerToken;
      engine.addSystemMessage(
        `Host left. ${nextHuman.ownerName} is now the host.`
      );
    }
  }

  public handleDisconnect(socketId: string): void {
    const session = this.getSessionBySocket(socketId);
    if (!session) return;

    session.socketId = null;
    const engine = this.getRoom(session.roomCode);
    if (!engine) return;

    const team = engine.getTeamByToken(session.playerToken);
    if (team) {
      team.isConnected = false;
      this.callbacks.onStateChange(engine.roomCode, engine.getPublicState());
    }

    // 10-second grace period before transferring host and handing team over to AI Bot
    session.disconnectTimer = setTimeout(() => {
      if (session.socketId !== null) return;
      this.sessions.delete(session.playerToken);

      const releasedTeam = engine.releaseHumanTeam(session.playerToken);
      this.transferHostIfNeeded(engine, session.playerToken);

      if (releasedTeam) {
        engine.addSystemMessage(
          `${session.displayName} disconnected. ${releasedTeam.franchise.shortName} has been taken over by AI Bot.`
        );
      }
      this.callbacks.onStateChange(engine.roomCode, engine.getPublicState());
    }, 10_000);
  }
}
