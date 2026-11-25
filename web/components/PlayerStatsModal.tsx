'use client';

import { BarChart3, Shield, TrendingUp, X } from 'lucide-react';
import playersData from '@shared/data/players.json';
import { formatINR, PLAYING_ROLE_LABELS } from '@shared/rules';
import { Player, PublicRoomState } from '@shared/types';

interface PlayerStatsModalProps {
  playerId: string | null;
  state: PublicRoomState;
  onClose: () => void;
}

export default function PlayerStatsModal({
  playerId,
  state,
  onClose,
}: PlayerStatsModalProps) {
  if (!playerId) return null;

  let foundTeam = null as PublicRoomState['teams'][string] | null;
  let acquired = null as
    | PublicRoomState['teams'][string]['squad'][number]
    | null;

  for (const team of Object.values(state.teams)) {
    const match = team.squad.find((item) => item.player.id === playerId);
    if (match) {
      foundTeam = team;
      acquired = match;
      break;
    }
  }

  const player: Player | undefined =
    acquired?.player ??
    (playersData as Player[]).find((p) => p.id === playerId);

  if (!player) return null;

  const seasonStats = state.seasonResult?.playerStats.find(
    (ps) => ps.playerId === playerId
  );

  const batAvg =
    seasonStats && seasonStats.matches > 0
      ? (seasonStats.runs / seasonStats.matches).toFixed(1)
      : '0.0';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/60 px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black text-white">{player.name}</h3>
              {player.isOverseas && (
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-300">
                  ✈️ Overseas
                </span>
              )}
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                {player.isUncapped ? 'Uncapped' : 'Capped'}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {player.country} •{' '}
              <span className="font-semibold text-amber-300">
                {player.playingRole
                  ? PLAYING_ROLE_LABELS[player.playingRole]
                  : player.role}
              </span>{' '}
              • {player.battingStyle}
              {player.bowlingStyle && player.bowlingStyle !== 'None'
                ? ` • ${player.bowlingStyle}`
                : ''}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
            aria-label="Close player stats"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Acquisition & Franchise Strip */}
          <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs sm:grid-cols-3">
            <div>
              <div className="text-[11px] text-slate-400">Franchise</div>
              <div className="mt-0.5 font-bold text-white">
                {foundTeam ? foundTeam.franchise.name : 'Unsold'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Auction Price</div>
              <div className="mt-0.5 font-mono font-bold text-amber-300">
                {acquired
                  ? formatINR(acquired.priceLakhs)
                  : formatINR(player.basePriceLakhs) + ' (Base)'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Acquisition</div>
              <div className="mt-0.5 font-semibold text-emerald-400">
                {acquired ? acquired.acquiredVia : '—'}
              </div>
            </div>
          </div>

          {/* Career Stats (IPL/T20, List A, First-Class) */}
          <div className="space-y-2.5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-300 uppercase">
              <BarChart3 className="h-4 w-4 text-sky-400" />
              Career Stats (Outside This Season)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                  <tr>
                    <th className="py-1.5 pr-2">Format</th>
                    <th className="px-2 py-1.5 text-right">Mat</th>
                    <th className="px-2 py-1.5 text-right">Runs</th>
                    <th className="px-2 py-1.5 text-right">Avg / SR</th>
                    <th className="px-2 py-1.5 text-right">Wkts</th>
                    <th className="py-1.5 pl-2 text-right">Econ</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: 'IPL / T20',
                      matches: player.stats.matches,
                      runs: player.stats.runs,
                      avgOrSr:
                        player.stats.strikeRate !== undefined
                          ? `SR ${player.stats.strikeRate.toFixed(1)}`
                          : '-',
                      wickets: player.stats.wickets,
                      economy: player.stats.economy,
                    },
                    ...(player.stats.listA
                      ? [
                          {
                            label: 'List A',
                            matches: player.stats.listA.matches,
                            runs: player.stats.listA.runs,
                            avgOrSr:
                              player.stats.listA.average !== undefined
                                ? `Avg ${player.stats.listA.average.toFixed(1)}`
                                : player.stats.listA.strikeRate !== undefined
                                  ? `SR ${player.stats.listA.strikeRate.toFixed(1)}`
                                  : '-',
                            wickets: player.stats.listA.wickets,
                            economy: player.stats.listA.economy,
                          },
                        ]
                      : []),
                    ...(player.stats.fc
                      ? [
                          {
                            label: 'First-Class',
                            matches: player.stats.fc.matches,
                            runs: player.stats.fc.runs,
                            avgOrSr:
                              player.stats.fc.average !== undefined
                                ? `Avg ${player.stats.fc.average.toFixed(1)}`
                                : player.stats.fc.strikeRate !== undefined
                                  ? `SR ${player.stats.fc.strikeRate.toFixed(1)}`
                                  : '-',
                            wickets: player.stats.fc.wickets,
                            economy: player.stats.fc.economy,
                          },
                        ]
                      : []),
                  ].map((row) => (
                    <tr
                      key={row.label}
                      className="border-b border-slate-800/50 last:border-b-0"
                    >
                      <td className="py-1.5 pr-2 font-semibold text-white">
                        {row.label}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-300">
                        {row.matches}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-300">
                        {row.runs !== undefined ? row.runs.toLocaleString() : '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-300">
                        {row.avgOrSr}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-400">
                        {row.wickets !== undefined ? row.wickets : '-'}
                      </td>
                      <td className="py-1.5 pl-2 text-right font-mono text-slate-300">
                        {row.economy !== undefined ? row.economy.toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Base Ratings */}
          <div className="space-y-2.5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-300 uppercase">
              <Shield className="h-4 w-4 text-amber-400" />
              Player Skill Ratings
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Overall', val: player.ratings.overall },
                { label: 'Batting', val: player.ratings.batting },
                { label: 'Bowling', val: player.ratings.bowling },
                { label: 'Fielding', val: player.ratings.fielding },
              ].map((r) => (
                <div key={r.label} className="text-xs">
                  <div className="mb-1 flex justify-between text-slate-300">
                    <span>{r.label}</span>
                    <span className="font-mono font-bold text-white">
                      {r.val}/100
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400"
                      style={{ width: `${Math.min(100, Math.max(0, r.val))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Season Simulation Stats */}
          {state.seasonResult && (
            <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-300 uppercase">
                  <TrendingUp className="h-4 w-4" />
                  Simulated IPL Season Stats
                </div>
              </div>

              {!seasonStats ? (
                <p className="text-xs text-slate-400">
                  Did not feature in a match during the simulated season.
                </p>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {[
                      { k: 'Matches', v: seasonStats.matches },
                      { k: 'Runs', v: seasonStats.runs },
                      { k: 'Balls', v: seasonStats.balls },
                      { k: 'High Score', v: seasonStats.highScore },
                      { k: 'Runs/Mat', v: batAvg },
                      { k: 'SR', v: seasonStats.strikeRate.toFixed(1) },
                    ].map((stat) => (
                      <div
                        key={stat.k}
                        className="rounded-xl border border-slate-800 bg-slate-950/70 p-2 text-center"
                      >
                        <div className="text-[10px] text-slate-400 uppercase">
                          {stat.k}
                        </div>
                        <div className="mt-0.5 font-mono text-sm font-black text-white">
                          {stat.v}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {[
                      { k: '4s / 6s', v: `${seasonStats.fours}/${seasonStats.sixes}` },
                      { k: '50s / 100s', v: `${seasonStats.fifties}/${seasonStats.hundreds}` },
                      { k: 'Overs', v: seasonStats.oversBowled },
                      { k: 'Wickets', v: seasonStats.wickets },
                      {
                        k: 'Econ',
                        v:
                          seasonStats.oversBowled > 0
                            ? seasonStats.economy.toFixed(2)
                            : '-',
                      },
                      { k: 'Best', v: seasonStats.bestBowling },
                    ].map((stat) => (
                      <div
                        key={stat.k}
                        className="rounded-xl border border-slate-800 bg-slate-950/70 p-2 text-center"
                      >
                        <div className="text-[10px] text-slate-400 uppercase">
                          {stat.k}
                        </div>
                        <div className="mt-0.5 font-mono text-sm font-black text-emerald-300">
                          {stat.v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
