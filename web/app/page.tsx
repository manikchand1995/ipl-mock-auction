'use client';

import { Gavel, Trophy, Users, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IPL_FRANCHISES } from '@shared/constants';
import { JoinSessionResponse } from '@shared/types';
import { getSocket, saveSession } from '@/lib/socket';

export default function HomePage() {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState('Manager');
  const [selectedTeamId, setSelectedTeamId] = useState('csk');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const createRoom = (mode: 'SINGLE_PLAYER' | 'MULTIPLAYER') => {
    setError(null);
    setLoading(true);
    const socket = getSocket();

    socket.emit(
      'createRoom',
      {
        displayName: ownerName.trim() || 'Manager',
        preferredTeamId: selectedTeamId,
        config: { mode },
      },
      (res: JoinSessionResponse) => {
        setLoading(false);
        if (!res.ok || !res.roomCode || !res.playerToken) {
          setError(res.error || 'Failed to create room');
          return;
        }
        saveSession({
          roomCode: res.roomCode,
          playerToken: res.playerToken,
          displayName: ownerName.trim() || 'Manager',
        });
        router.push(`/room/${res.roomCode}`);
      }
    );
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError(null);
    setLoading(true);
    const socket = getSocket();

    socket.emit(
      'joinRoom',
      {
        roomCode: joinCode.trim().toUpperCase(),
        displayName: ownerName.trim() || 'Manager',
      },
      (res: JoinSessionResponse) => {
        setLoading(false);
        if (!res.ok || !res.roomCode || !res.playerToken) {
          setError(res.error || 'Could not join room');
          return;
        }
        saveSession({
          roomCode: res.roomCode,
          playerToken: res.playerToken,
          displayName: ownerName.trim() || 'Manager',
        });
        router.push(`/room/${res.roomCode}`);
      }
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-12">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold tracking-widest text-amber-300 uppercase">
          <Trophy className="h-4 w-4" /> IPL Mega Auction Simulator
        </div>
        <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">
          Build Your <span className="text-amber-400">Championship</span> Squad
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400 md:text-base">
          Outbid rival AI personalities or challenge friends in real-time private rooms
          with authentic IPL retentions, RTM cards, accelerated rounds, and squad grading.
        </p>
      </div>

      {error && (
        <div className="mx-auto mb-6 w-full max-w-xl rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-center text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
          <div className="flex items-center gap-2 text-lg font-bold text-white">
            <Gavel className="h-5 w-5 text-amber-400" />
            Host New Auction
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">
                Your Manager Name
              </label>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">
                Preferred Franchise
              </label>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-white focus:border-amber-400 focus:outline-none"
              >
                {IPL_FRANCHISES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.shortName}) — {f.homeGround.pitchLabel}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const selected = IPL_FRANCHISES.find((f) => f.id === selectedTeamId);
              if (!selected) return null;
              return (
                <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300">
                      🏟️ {selected.homeGround.stadium}
                    </span>
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                      Par {selected.homeGround.parScore}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-400">
                    <strong className="text-slate-200">
                      {selected.homeGround.pitchLabel}:
                    </strong>{' '}
                    {selected.homeGround.summary}
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <button
              disabled={loading}
              onClick={() => createRoom('SINGLE_PLAYER')}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:brightness-110 disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              Single Player (vs AI)
            </button>
            <button
              disabled={loading}
              onClick={() => createRoom('MULTIPLAYER')}
              className="flex items-center justify-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-3 text-sm font-bold text-sky-200 transition hover:bg-sky-500/25 disabled:opacity-50"
            >
              <Users className="h-4 w-4" />
              Multiplayer Room
            </button>
          </div>
        </div>

        <form
          onSubmit={joinRoom}
          className="flex flex-col justify-between rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-lg font-bold text-white">
              <Users className="h-5 w-5 text-emerald-400" />
              Join Friends&apos; Room
            </div>
            <p className="text-sm text-slate-400">
              Got a 6-character room code or invite link? Enter it below to claim an
              open franchise before the gavel drops.
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">
                Room Code
              </label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. X7K9P2"
                maxLength={8}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-lg font-bold tracking-widest text-white uppercase focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !joinCode.trim()}
            className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            Join Live Room
          </button>
        </form>
      </div>
    </main>
  );
}
