'use client';

import { CheckCircle2, Lock, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';
import playersData from '@shared/data/players.json';
import { calculateRetentionCostLakhs, formatINR } from '@shared/rules';
import { Player, PublicRoomState } from '@shared/types';

interface RetentionPhaseProps {
  state: PublicRoomState;
  playerToken: string;
  onSubmitRetention: (playerIds: string[]) => void;
  onForceStartBidding: () => void;
}

export default function RetentionPhase({
  state,
  playerToken,
  onSubmitRetention,
  onForceStartBidding,
}: RetentionPhaseProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const isHost = state.hostToken === playerToken;
  const myTeam = Object.values(state.teams).find(
    (t) => t.playerToken === playerToken
  );

  const eligiblePlayers = useMemo(() => {
    if (!myTeam) return [];
    return (playersData as Player[])
      .filter((p) => p.previousTeamId === myTeam.franchise.id)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);
  }, [myTeam]);

  const selectedPlayers = eligiblePlayers.filter((p) =>
    selectedIds.includes(p.id)
  );
  const totalCost = calculateRetentionCostLakhs(selectedPlayers);
  const rtmLeft = Math.max(
    0,
    state.config.maxRetentionsAndRTM - selectedIds.length
  );
  const isLocked = myTeam
    ? state.retentionReadyTeams.includes(myTeam.franchise.id)
    : true;

  const togglePlayer = (id: string) => {
    if (isLocked) return;
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else if (selectedIds.length < state.config.maxRetentionsAndRTM) {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-amber-400 uppercase">
            <Shield className="h-4 w-4" /> Pre-Auction Retention Phase
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">
            {myTeam
              ? `${myTeam.franchise.name} — Retain Core Players`
              : 'Waiting for Managers to Lock Retentions'}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Unused retention slots (up to {state.config.maxRetentionsAndRTM}) become{' '}
            <strong className="text-amber-300">RTM Cards</strong> in the live auction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {myTeam && !isLocked && (
            <button
              onClick={() => onSubmitRetention(selectedIds)}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              <Lock className="h-4 w-4" />
              Lock Retentions ({selectedIds.length})
            </button>
          )}
          {isHost && (
            <button
              onClick={onForceStartBidding}
              className="rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
            >
              Begin Live Bidding Now
            </button>
          )}
        </div>
      </div>

      {Object.values(state.teams).some((t) => t.ownerType === 'HUMAN') && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/50 px-4 py-2.5 text-xs">
          <span className="font-semibold text-slate-400">Human Managers:</span>
          {Object.values(state.teams)
            .filter((t) => t.ownerType === 'HUMAN')
            .map((t) => {
              const ready = state.retentionReadyTeams.includes(t.franchise.id);
              return (
                <span
                  key={t.franchise.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${
                    ready
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : !t.isConnected
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  <span>{t.franchise.shortName}</span>
                  <span className="text-[11px] opacity-80">
                    {ready
                      ? '• Locked'
                      : !t.isConnected
                        ? '• Disconnected (Bot taking over)'
                        : '• Selecting...'}
                  </span>
                </span>
              );
            })}
        </div>
      )}

      {myTeam && (
        <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-slate-400">Retention Cost</div>
            <div className="font-mono text-xl font-bold text-rose-400">
              {formatINR(totalCost)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Purse Entering Auction</div>
            <div className="font-mono text-xl font-bold text-emerald-400">
              {formatINR(state.config.totalPurseLakhs - totalCost)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">RTM Cards Unlocked</div>
            <div className="font-mono text-xl font-bold text-amber-300">
              {rtmLeft} Cards
            </div>
          </div>
        </div>
      )}

      {myTeam && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {eligiblePlayers.map((p) => {
            const active = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                disabled={isLocked}
                onClick={() => togglePlayer(p.id)}
                className={`flex items-center justify-between rounded-xl border p-4 text-left transition ${
                  active
                    ? 'border-emerald-400 bg-emerald-500/15'
                    : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                } ${isLocked ? 'opacity-70' : ''}`}
              >
                <div>
                  <div className="flex items-center gap-2 font-semibold text-white">
                    {p.name}
                    {p.isOverseas && <span className="text-xs">✈️</span>}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {p.role} • OVR {p.ratings.overall} •{' '}
                    {p.isUncapped ? 'Uncapped (₹4 Cr)' : 'Capped Slab'}
                  </div>
                </div>
                {active && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
