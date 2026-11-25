'use client';

import { io, Socket } from 'socket.io-client';

const SERVER_URL =
  process.env.NEXT_PUBLIC_AUCTION_SERVER_URL || 'http://localhost:4000';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    });
  }
  return socketInstance;
}

export interface StoredSession {
  roomCode: string;
  playerToken: string;
  displayName: string;
}

const SESSION_KEY = 'ipl_auction_session_v1';

export function saveSession(session: StoredSession): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
}
