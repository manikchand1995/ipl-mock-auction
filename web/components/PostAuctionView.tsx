'use client';

import { Award, Play, RotateCcw, Sparkles, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { formatINR, PLAYING_ROLE_LABELS } from '@shared/rules';
import { PublicRoomState } from '@shared/types';
import PlayerStatsModal from './PlayerStatsModal';
import SeasonCenter from './SeasonCenter';

interface PostAuctionViewProps {
  state: PublicRoomState;
  playerToken: string;
  onSimulateSeason: () => void;
  onSetLeadership?: (
    captainId: string | null,
    viceCaptainId: string | null
  ) => void;
  onPlayAgain: () => void;
}

export default function PostAuctionView({
  state,
  playerToken,
  onSimulateSeason,
  onSetLeadership,
  onPlayAgain,
}: PostAuctionViewProps) {
  const myTeam = Object.values(state.teams).find(
    (t) => t.playerToken === playerToken
  );
  const [selectedTeamId, setSelectedTeamId] = useState(
    myTeam?.franchise.id || 'csk'
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const grades = state.grades || {};
  const rankedTeams = Object.values(state.teams).sort(
    (a, b) =>
      (grades[b.franchise.id]?.overallScore ?? 0) -
      (grades[a.franchise.id]?.overallScore ?? 0)
  );

  const activeTeam = state.teams[selectedTeamId];
  const activeGrade = grades[selectedTeamId];
  const isMyActiveTeam = Boolean(
    activeTeam && activeTeam.playerToken === playerToken
  );
  const captainId = activeTeam?.captainId ?? activeGrade?.captainId ?? null;
  const viceCaptainId =
    activeTeam?.viceCaptainId ?? activeGrade?.viceCaptainId ?? null;
  const captainPlayer = activeTeam?.squad.find(
    (s) => s.player.id === captainId
  )?.player;
  const viceCaptainPlayer = activeTeam?.squad.find(
    (s) => s.player.id === viceCaptainId
  )?.player;

  const assignRole = (playerId: string, role: 'C' | 'VC') => {
    if (!onSetLeadership || !isMyActiveTeam) return;
    if (role === 'C') {
      const nextVc = viceCaptainId === playerId ? captainId : viceCaptainId;
      onSetLeadership(playerId, nextVc ?? null);
    } else {
      const nextCap = captainId === playerId ? viceCaptainId : captainId;
      onSetLeadership(nextCap ?? null, playerId);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 md:flex-row md:items-center">
        <div>
          <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">
            Auction Complete
          </span>
          <h1 className="mt-1 text-2xl font-black text-white">
            Final Squads, Playing XI & Automated Grades
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onSimulateSeason}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110"
          >
            <Play className="h-4 w-4 fill-current" />
            {state.seasonResult ? 'Re-Simulate Season' : 'Simulate IPL Season'}
          </button>
          <button
            onClick={onPlayAgain}
            className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
          >
            <RotateCcw className="h-4 w-4" />
            New Auction
          </button>
        </div>
      </div>

      {/* Leaderboard Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {rankedTeams.map((team, idx) => {
          const g = grades[team.franchise.id];
          const isSelected = team.franchise.id === selectedTeamId;
          return (
            <button
              key={team.franchise.id}
              onClick={() => setSelectedTeamId(team.franchise.id)}
              className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                isSelected
                  ? 'border-amber-400 bg-amber-500/15'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
              }`}
            >
              <div>
                <div className="text-[11px] text-slate-400">#{idx + 1} Rank</div>
                <div className="font-bold text-white">
                  {team.franchise.shortName}
                </div>
                <div className="text-[11px] text-slate-400">
                  {team.squad.length} players • {formatINR(team.remainingPurseLakhs)} left
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-amber-400">
                  {g?.grade ?? '-'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {g?.overallScore ?? 0}/100
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {activeTeam && activeGrade && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Playing XI + Impact Player */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <Award className="h-5 w-5 text-amber-400" />
                {activeTeam.franchise.name} — Best Playing XI
              </h2>
              <span className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-amber-300">
                Grade {activeGrade.grade} ({activeGrade.overallScore}/100)
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                    C
                  </span>{' '}
                  <strong className="text-white">
                    {captainPlayer?.name ?? 'Unassigned'}
                  </strong>
                </span>
                <span>
                  <span className="rounded bg-sky-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                    VC
                  </span>{' '}
                  <strong className="text-white">
                    {viceCaptainPlayer?.name ?? 'Unassigned'}
                  </strong>
                </span>
              </div>
              {isMyActiveTeam && (
                <span className="text-[11px] text-slate-400">
                  Click C / VC on any player below to change
                </span>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {activeGrade.playingXI.map((item, idx) => {
                const isC = item.player.id === captainId;
                const isVC = item.player.id === viceCaptainId;
                return (
                <div
                  key={item.player.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-slate-500">
                      {idx + 1}.
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedPlayerId(item.player.id)}
                          className="text-left font-semibold text-white transition hover:text-amber-300 hover:underline"
                        >
                          {item.player.name}{' '}
                          {item.player.isOverseas && (
                            <span className="text-sky-400">✈️</span>
                          )}
                        </button>
                        {isC && (
                          <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                            C
                          </span>
                        )}
                        {isVC && (
                          <span className="rounded bg-sky-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                            VC
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {item.player.playingRole
                          ? PLAYING_ROLE_LABELS[item.player.playingRole]
                          : item.player.role}{' '}
                        • OVR {item.player.ratings.overall}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isMyActiveTeam && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => assignRole(item.player.id, 'C')}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                            isC
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                          }`}
                          title="Set as Captain"
                        >
                          C
                        </button>
                        <button
                          type="button"
                          onClick={() => assignRole(item.player.id, 'VC')}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                            isVC
                              ? 'bg-sky-400 text-slate-950'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                          }`}
                          title="Set as Vice-Captain"
                        >
                          VC
                        </button>
                      </div>
                    )}
                    <span className="font-mono text-amber-300">
                      {formatINR(item.priceLakhs)}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>

            {activeGrade.impactPlayer && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs">
                <span className="font-bold text-sky-300 uppercase">
                  Impact Player:{' '}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPlayerId(activeGrade.impactPlayer!.player.id)
                  }
                  className="font-semibold text-white transition hover:text-amber-300 hover:underline"
                >
                  {activeGrade.impactPlayer.player.name}
                </button>{' '}
                ({activeGrade.impactPlayer.player.role} • OVR{' '}
                {activeGrade.impactPlayer.player.ratings.overall})
              </div>
            )}

            {/* Full Bench / Reserves */}
            {(() => {
              const xiIds = new Set(activeGrade.playingXI.map((x) => x.player.id));
              const impactId = activeGrade.impactPlayer?.player.id;
              const bench = activeTeam.squad.filter(
                (item) => !xiIds.has(item.player.id) && item.player.id !== impactId
              );
              return (
                <div className="border-t border-slate-800 pt-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                      Bench &amp; Reserves ({bench.length}) • Total Squad ({activeTeam.squad.length})
                    </h3>
                  </div>
                  {bench.length === 0 ? (
                    <p className="text-xs text-slate-500">No reserve players.</p>
                  ) : (
                    <div className="grid max-h-60 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {bench.map((item) => (
                        <div
                          key={item.player.id}
                          className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-xs"
                        >
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedPlayerId(item.player.id)}
                              className="text-left font-medium text-slate-200 transition hover:text-amber-300 hover:underline"
                            >
                              {item.player.name}{' '}
                              {item.player.isOverseas && (
                                <span className="text-sky-400">✈️</span>
                              )}
                            </button>
                            <div className="text-[11px] text-slate-500">
                              {item.player.role} • OVR {item.player.ratings.overall}
                              {item.acquiredVia !== 'AUCTION'
                                ? ` • ${item.acquiredVia}`
                                : ''}
                            </div>
                          </div>
                          <span className="font-mono text-emerald-400">
                            {formatINR(item.priceLakhs)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Ratings & Highlights */}
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold tracking-wider text-slate-300 uppercase">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Squad Breakdown
            </h3>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 text-[11px] text-slate-300">
                🏟️ <strong className="text-white">{activeTeam.franchise.homeGround.stadium}</strong>{' '}
                <span className="text-sky-300">
                  ({activeTeam.franchise.homeGround.pitchLabel} • Par {activeTeam.franchise.homeGround.parScore})
                </span>
              </div>
              {[
                { label: 'Batting Power', val: activeGrade.battingScore },
                { label: 'Bowling Attack', val: activeGrade.bowlingScore },
                { label: 'Squad Balance', val: activeGrade.balanceScore },
                { label: 'Home Ground Fit', val: activeGrade.homeAdvantageScore },
              ].map((m) => (
                <div key={m.label}>
                  <div className="mb-1 flex justify-between text-slate-300">
                    <span>{m.label}</span>
                    <span className="font-bold text-white">{m.val}/100</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400"
                      style={{ width: `${m.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {activeGrade.strengths.length > 0 && (
              <div className="space-y-1 text-xs">
                <div className="font-bold text-emerald-400">Strengths</div>
                {activeGrade.strengths.map((s) => (
                  <div key={s} className="text-slate-300">
                    • {s}
                  </div>
                ))}
              </div>
            )}

            {activeGrade.weaknesses.length > 0 && (
              <div className="space-y-1 text-xs">
                <div className="font-bold text-rose-400">Gaps</div>
                {activeGrade.weaknesses.map((w) => (
                  <div key={w} className="text-slate-300">
                    • {w}
                  </div>
                ))}
              </div>
            )}

            {activeGrade.bestValueBuy && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
                <div className="flex items-center gap-1 font-bold text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" /> Best Value Buy
                </div>
                <div className="mt-1 text-white">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPlayerId(activeGrade.bestValueBuy!.player.id)
                    }
                    className="font-semibold transition hover:text-amber-300 hover:underline"
                  >
                    {activeGrade.bestValueBuy.player.name}
                  </button>{' '}
                  — {formatINR(activeGrade.bestValueBuy.priceLakhs)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Simulated IPL Season & Playoffs */}
      {state.seasonResult && (
        <SeasonCenter
          season={state.seasonResult}
          teams={state.teams}
          onSelectPlayer={setSelectedPlayerId}
        />
      )}

      {/* Player Stats Modal */}
      <PlayerStatsModal
        playerId={selectedPlayerId}
        state={state}
        onClose={() => setSelectedPlayerId(null)}
      />
    </div>
  );
}
