'use client';

import { LogOut, Wifi, WifiOff } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  FloatingReaction,
  JoinSessionResponse,
  PublicRoomState,
  RoomConfig,
} from '@shared/types';
import BroadcastStage from '@/components/BroadcastStage';
import ChatReactions from '@/components/ChatReactions';
import FranchiseSidebar from '@/components/FranchiseSidebar';
import LobbyView from '@/components/LobbyView';
import PostAuctionView from '@/components/PostAuctionView';
import RetentionPhase from '@/components/RetentionPhase';
import { soundManager } from '@/components/SoundManager';
import {
  clearSession,
  getSocket,
  loadSession,
  saveSession,
} from '@/lib/socket';

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = (params.code || '').toUpperCase();

  const [state, setState] = useState<PublicRoomState | null>(null);
  const [playerToken, setPlayerToken] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [joinName, setJoinName] = useState('');
  const [needsJoinPrompt, setNeedsJoinPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevPhaseRef = useRef<string | null>(null);
  const prevBidCountRef = useRef<number>(0);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      const saved = loadSession();
      if (saved && saved.roomCode === roomCode && saved.playerToken) {
        socket.emit(
          'rejoinSession',
          { roomCode, playerToken: saved.playerToken },
          (res: JoinSessionResponse) => {
            if (res.ok && res.state && res.playerToken) {
              setPlayerToken(res.playerToken);
              setState(res.state);
              setNeedsJoinPrompt(false);
            } else {
              clearSession();
              setNeedsJoinPrompt(true);
            }
          }
        );
      } else {
        setNeedsJoinPrompt(true);
      }
    };

    const onDisconnect = () => setConnected(false);

    const onStateUpdate = (nextState: PublicRoomState) => {
      // Trigger broadcast SFX on transitions
      if (
        prevPhaseRef.current !== nextState.phase &&
        nextState.phase === 'SOLD_REVEAL'
      ) {
        soundManager.playSold();
      } else if (
        prevPhaseRef.current !== nextState.phase &&
        nextState.phase === 'UNSOLD_REVEAL'
      ) {
        soundManager.playUnsold();
      } else if (
        nextState.currentLot &&
        nextState.currentLot.bidHistory.length > prevBidCountRef.current
      ) {
        soundManager.playBid();
      }

      prevPhaseRef.current = nextState.phase;
      prevBidCountRef.current = nextState.currentLot?.bidHistory.length ?? 0;
      setState(nextState);
    };

    const onReaction = (reaction: FloatingReaction) => {
      setReactions((prev) => [...prev.slice(-14), reaction]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, 1900);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('stateUpdate', onStateUpdate);
    socket.on('floatingReaction', onReaction);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('stateUpdate', onStateUpdate);
      socket.off('floatingReaction', onReaction);
    };
  }, [roomCode]);

  const handleJoinViaInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const socket = getSocket();
    socket.emit(
      'joinRoom',
      { roomCode, displayName: joinName.trim() || 'Player' },
      (res: JoinSessionResponse) => {
        if (!res.ok || !res.playerToken || !res.state) {
          setError(res.error || 'Could not join room');
          return;
        }
        saveSession({
          roomCode,
          playerToken: res.playerToken,
          displayName: joinName.trim() || 'Player',
        });
        setPlayerToken(res.playerToken);
        setState(res.state);
        setNeedsJoinPrompt(false);
      }
    );
  };

  if (needsJoinPrompt) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <form
          onSubmit={handleJoinViaInvite}
          className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl"
        >
          <h1 className="text-xl font-black text-white">
            Join Room <span className="font-mono text-amber-400">{roomCode}</span>
          </h1>
          <p className="text-xs text-slate-400">
            Enter your manager name to join this live IPL auction room.
          </p>
          {error && (
            <div className="rounded-lg bg-rose-500/15 p-2.5 text-xs text-rose-300">
              {error}
            </div>
          )}
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your Manager Name"
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-amber-400 py-3 text-sm font-black text-slate-950 hover:bg-amber-300"
          >
            Enter Room
          </button>
        </form>
      </main>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Connecting to IPL Auction Room {roomCode}...
      </div>
    );
  }

  const socket = getSocket();

  const handleExitRoom = () => {
    let navigated = false;
    const finish = () => {
      if (navigated) return;
      navigated = true;
      clearSession();
      router.push('/');
    };
    if (socket.connected) {
      socket.emit('leaveRoom', finish);
      setTimeout(finish, 400);
    } else {
      finish();
    }
  };

  return (
    <div className="relative min-h-screen pb-10">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/80 bg-[#070b14]/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={handleExitRoom}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 hover:text-rose-200"
            title="Exit room (AI Bot will take over your franchise)"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Exit Room</span>
          </button>
          <span className="text-sm font-black tracking-tight text-white">
            IPL AUCTION{' '}
            <span className="font-mono text-amber-400">#{state.roomCode}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Wifi className="h-3.5 w-3.5" /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-rose-400">
              <WifiOff className="h-3.5 w-3.5" /> Reconnecting...
            </span>
          )}
        </div>
      </header>

      {/* Floating Emoji Reactions */}
      <div className="pointer-events-none fixed right-8 bottom-16 z-50 flex flex-col items-end">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="animate-float-up flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-lg shadow-lg"
          >
            <span>{r.emoji}</span>
            <span className="text-[10px] font-bold text-slate-300">
              {r.senderName}
            </span>
          </div>
        ))}
      </div>

      {/* Phase Router */}
      {state.phase === 'LOBBY' && (
        <LobbyView
          state={state}
          playerToken={playerToken}
          onSelectTeam={(teamId) => socket.emit('selectTeam', { teamId })}
          onUpdateConfig={(patch: Partial<RoomConfig>) =>
            socket.emit('updateConfig', patch)
          }
          onStartAuction={() => socket.emit('startAuction')}
        />
      )}

      {state.phase === 'RETENTION' && (
        <RetentionPhase
          state={state}
          playerToken={playerToken}
          onSubmitRetention={(playerIds) =>
            socket.emit('submitRetentions', { playerIds })
          }
          onForceStartBidding={() => socket.emit('forceBeginBidding')}
        />
      )}

      {state.phase === 'COMPLETED' && (
        <PostAuctionView
          state={state}
          playerToken={playerToken}
          onSimulateSeason={() => socket.emit('simulateSeason')}
          onPlayAgain={handleExitRoom}
        />
      )}

      {(state.phase === 'BIDDING' ||
        state.phase === 'RTM_COUNTER' ||
        state.phase === 'RTM_DECISION' ||
        state.phase === 'SOLD_REVEAL' ||
        state.phase === 'UNSOLD_REVEAL' ||
        state.phase === 'PAUSED') && (
        <div className="mx-auto grid max-w-[1440px] gap-4 p-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <FranchiseSidebar state={state} playerToken={playerToken} />
          </div>

          <div className="lg:col-span-6">
            <BroadcastStage
              state={state}
              playerToken={playerToken}
              muted={muted}
              onToggleMute={() => {
                soundManager.muted = !muted;
                setMuted(!muted);
              }}
              onBid={() => socket.emit('placeBid', {})}
              onRTMCounter={(raiseLakhs) =>
                socket.emit('submitRTMCounter', { raiseLakhs })
              }
              onRTMDecision={(useRtm) =>
                socket.emit('submitRTMDecision', { useRtm })
              }
              onTogglePause={() =>
                socket.emit('hostControl', { action: 'PAUSE' })
              }
              onSkipLot={() => socket.emit('hostControl', { action: 'SKIP' })}
              onTriggerAccelerated={() =>
                socket.emit('hostControl', { action: 'ACCELERATE' })
              }
              onSimulateAuction={() =>
                socket.emit('hostControl', { action: 'SIMULATE' })
              }
              onEndAuction={() => socket.emit('hostControl', { action: 'END' })}
            />
          </div>

          <div className="lg:col-span-3">
            <ChatReactions
              messages={state.chatMessages}
              onSendChat={(text) => socket.emit('sendChat', { text })}
              onSendReaction={(emoji) => socket.emit('sendReaction', { emoji })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
