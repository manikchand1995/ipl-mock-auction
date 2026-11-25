'use client';

import { Check, Copy, Play, Settings, Users } from 'lucide-react';
import { useState } from 'react';
import { formatINR } from '@shared/rules';
import { PublicRoomState, RoomConfig } from '@shared/types';

interface LobbyViewProps {
  state: PublicRoomState;
  playerToken: string;
  onSelectTeam: (teamId: string) => void;
  onUpdateConfig: (patch: Partial<RoomConfig>) => void;
  onStartAuction: () => void;
}

export default function LobbyView({
  state,
  playerToken,
  onSelectTeam,
  onUpdateConfig,
  onStartAuction,
}: LobbyViewProps) {
  const [copied, setCopied] = useState(false);
  const isHost = state.hostToken === playerToken;

  const copyInvite = () => {
    const url = `${window.location.origin}/room/${state.roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-400 uppercase">
            <Users className="h-4 w-4" />
            {state.config.mode === 'SINGLE_PLAYER'
              ? 'Single Player vs AI'
              : 'Multiplayer Auction Room'}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">
            Room <span className="font-mono text-amber-400">{state.roomCode}</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={copyInvite}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? 'Invite Link Copied!' : 'Copy Invite Link'}
          </button>

          {isHost && (
            <button
              onClick={onStartAuction}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110"
            >
              <Play className="h-4 w-4 fill-current" />
              Start Auction
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Franchise Selection Grid */}
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase">
            Select Your Franchise (Empty slots auto-fill with AI)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.values(state.teams).map((team) => {
              const isMine = team.playerToken === playerToken;
              const isTakenByOtherHuman = team.ownerType === 'HUMAN' && !isMine;
              return (
                <button
                  key={team.franchise.id}
                  disabled={isTakenByOtherHuman}
                  onClick={() => onSelectTeam(team.franchise.id)}
                  className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition ${
                    isMine
                      ? 'border-amber-400 bg-amber-500/10 ring-1 ring-amber-400/50'
                      : isTakenByOtherHuman
                        ? 'cursor-not-allowed border-slate-800 bg-slate-900/40 opacity-60'
                        : 'border-slate-800 bg-slate-900/70 hover:border-slate-600 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-black shadow-inner"
                        style={{
                          backgroundColor: team.franchise.primaryColor,
                          color:
                            team.franchise.id === 'csk' ? '#0f172a' : '#ffffff',
                        }}
                      >
                        {team.franchise.shortName}
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {team.franchise.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {team.ownerType === 'HUMAN'
                            ? `👤 ${team.ownerName}${isMine ? ' (You)' : ''}`
                            : `🤖 AI (${team.aiPersonality.replace('_', ' ')})`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-xs font-mono text-amber-300">
                      {formatINR(team.remainingPurseLakhs)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
                    <span className="truncate">
                      🏟️ {team.franchise.homeGround.city} •{' '}
                      <strong className="text-sky-300">
                        {team.franchise.homeGround.pitchLabel}
                      </strong>
                    </span>
                    <span className="font-mono text-slate-300">
                      Par {team.franchise.homeGround.parScore}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Host Rules Configurator */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wider text-slate-300 uppercase">
            <Settings className="h-4 w-4 text-amber-400" />
            Room Rules {!isHost && '(Host Only)'}
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <label className="mb-1 flex justify-between text-xs text-slate-400">
                <span>Total Purse</span>
                <span className="font-mono text-amber-300">
                  {formatINR(state.config.totalPurseLakhs)}
                </span>
              </label>
              <select
                disabled={!isHost}
                value={state.config.totalPurseLakhs}
                onChange={(e) =>
                  onUpdateConfig({ totalPurseLakhs: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
              >
                <option value={9000}>₹90 Cr</option>
                <option value={10000}>₹100 Cr (Classic)</option>
                <option value={12000}>₹120 Cr (Mega Auction)</option>
                <option value={15000}>₹150 Cr (High Budget)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Min Squad
                </label>
                <input
                  type="number"
                  min={11}
                  max={20}
                  disabled={!isHost}
                  value={state.config.minSquadSize}
                  onChange={(e) =>
                    onUpdateConfig({ minSquadSize: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Max Squad
                </label>
                <input
                  type="number"
                  min={18}
                  max={30}
                  disabled={!isHost}
                  value={state.config.maxSquadSize}
                  onChange={(e) =>
                    onUpdateConfig({ maxSquadSize: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Bid Timer (s)
                </label>
                <input
                  type="number"
                  min={5}
                  max={25}
                  disabled={!isHost}
                  value={state.config.bidTimerSeconds}
                  onChange={(e) =>
                    onUpdateConfig({ bidTimerSeconds: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  AI Difficulty
                </label>
                <select
                  disabled={!isHost}
                  value={state.config.aiDifficulty}
                  onChange={(e) =>
                    onUpdateConfig({
                      aiDifficulty: e.target.value as RoomConfig['aiDifficulty'],
                    })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
                >
                  <option value="CASUAL">Casual</option>
                  <option value="COMPETITIVE">Competitive</option>
                  <option value="SHARK">Shark</option>
                </select>
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <span className="text-xs font-medium text-slate-200">
                Enable Retentions &amp; RTM Cards
              </span>
              <input
                type="checkbox"
                disabled={!isHost}
                checked={state.config.enableRetentionAndRTM}
                onChange={(e) =>
                  onUpdateConfig({ enableRetentionAndRTM: e.target.checked })
                }
                className="h-4 w-4 accent-amber-400"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
