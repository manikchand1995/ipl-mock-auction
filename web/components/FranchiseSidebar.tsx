'use client';

import { useState } from 'react';
import { formatINR, getOverseasCount } from '@shared/rules';
import { AcquiredPlayer, PublicRoomState } from '@shared/types';

interface FranchiseSidebarProps {
  state: PublicRoomState;
  playerToken: string;
}

function getSquadBalance(squad: AcquiredPlayer[]) {
  let bat = 0;
  let wk = 0;
  let ar = 0;
  let pace = 0;
  let spin = 0;
  let openers = 0;

  for (const item of squad) {
    const p = item.player;
    if (p.playingRole === 'OPENER') openers++;
    if (p.role === 'BAT') bat++;
    else if (p.role === 'WK') wk++;
    else if (p.role === 'AR') ar++;

    const style = p.bowlingStyle.toLowerCase();
    const isSpin =
      p.playingRole === 'SPIN_BOWL' ||
      p.playingRole === 'SPIN_AR' ||
      style.includes('break') ||
      style.includes('orthodox') ||
      style.includes('spin');
    const isPace =
      p.playingRole === 'PACE_BOWL' ||
      p.playingRole === 'PACE_AR' ||
      style.includes('fast') ||
      style.includes('medium');

    if (p.role === 'BOWL' || p.role === 'AR') {
      if (isSpin) spin++;
      else if (isPace) pace++;
    }
  }

  return { bat, wk, ar, pace, spin, openers };
}

export default function FranchiseSidebar({
  state,
  playerToken,
}: FranchiseSidebarProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="landscape-scroll-panel flex flex-col gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
          Franchise Purses &amp; Squads
        </h3>
        <span className="text-[11px] text-slate-500">Click to inspect</span>
      </div>

      <div className="space-y-2">
        {Object.values(state.teams).map((team) => {
          const isMine = team.playerToken === playerToken;
          const isExpanded = expandedId === team.franchise.id;
          const overseasCount = getOverseasCount(team);
          const balance = getSquadBalance(team.squad);
          const neededForMin = Math.max(
            0,
            state.config.minSquadSize - team.squad.length
          );
          const gaps: string[] = [];
          if (balance.wk === 0) gaps.push('WK');
          if (balance.openers < 2) gaps.push('Opener');
          if (balance.pace < 2) gaps.push('Pace');
          if (balance.spin < 2) gaps.push('Spin');

          return (
            <div
              key={team.franchise.id}
              className={`rounded-xl border transition ${
                isMine
                  ? 'border-amber-400/70 bg-amber-500/10'
                  : 'border-slate-800 bg-slate-950/60'
              }`}
            >
              <button
                onClick={() =>
                  setExpandedId(isExpanded ? null : team.franchise.id)
                }
                className="flex w-full items-center justify-between p-2.5 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-7 w-10 items-center justify-center rounded-md text-[11px] font-black"
                    style={{
                      backgroundColor: team.franchise.primaryColor,
                      color: team.franchise.id === 'csk' ? '#0f172a' : '#fff',
                    }}
                  >
                    {team.franchise.shortName}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      {team.ownerType === 'HUMAN' ? team.ownerName : 'AI Bot'}
                      {isMine && (
                        <span className="rounded bg-amber-400 px-1 text-[9px] font-black text-slate-950">
                          YOU
                        </span>
                      )}
                      {team.ownerType === 'HUMAN' && !team.isConnected && (
                        <span className="text-[10px] text-rose-400">(offline)</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {team.squad.length}/{state.config.maxSquadSize} players • ✈️{' '}
                      {overseasCount}/{state.config.maxOverseas} • RTM{' '}
                      {team.rtmCardsRemaining}
                    </div>
                  </div>
                </div>
                <div className="font-mono text-xs font-bold text-amber-300">
                  {formatINR(team.remainingPurseLakhs)}
                </div>
              </button>

              {isMine && !isExpanded && team.squad.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-amber-400/20 px-2.5 py-1.5 text-[10px] text-slate-300">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">
                    BAT <strong className="text-white">{balance.bat}</strong>
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">
                    WK <strong className="text-white">{balance.wk}</strong>
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">
                    AR <strong className="text-white">{balance.ar}</strong>
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">
                    PACE <strong className="text-sky-300">{balance.pace}</strong>
                  </span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">
                    SPIN <strong className="text-emerald-300">{balance.spin}</strong>
                  </span>
                </div>
              )}

              {isExpanded && (
                <div className="space-y-2 border-t border-slate-800/80 px-3 py-2.5 text-xs">
                  {/* Squad Balance Breakdown */}
                  <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                    <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      <span>Squad Balance</span>
                      <span className="text-slate-300">
                        {neededForMin > 0
                          ? `Need ${neededForMin} for min ${state.config.minSquadSize}`
                          : `Min ${state.config.minSquadSize} met ✓`}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
                      {[
                        { label: 'BAT', val: balance.bat, cls: 'text-white' },
                        { label: 'WK', val: balance.wk, cls: 'text-amber-300' },
                        { label: 'AR', val: balance.ar, cls: 'text-purple-300' },
                        { label: 'PACE', val: balance.pace, cls: 'text-sky-300' },
                        { label: 'SPIN', val: balance.spin, cls: 'text-emerald-300' },
                      ].map((cell) => (
                        <div
                          key={cell.label}
                          className="rounded bg-slate-950/80 py-1"
                        >
                          <div className="text-[9px] text-slate-500">
                            {cell.label}
                          </div>
                          <div className={`font-mono font-bold ${cell.cls}`}>
                            {cell.val}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400">
                      <span>
                        Openers: <strong className="text-slate-200">{balance.openers}</strong> • Domestic:{' '}
                        <strong className="text-slate-200">
                          {team.squad.length - overseasCount}
                        </strong>
                      </span>
                      {gaps.length > 0 && (
                        <span className="text-rose-300">
                          Low: {gaps.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {team.squad.length === 0 ? (
                    <div className="py-1 text-slate-500">No players yet.</div>
                  ) : (
                    <div className="max-h-36 space-y-1 overflow-y-auto">
                      {team.squad.map((item) => (
                        <div
                          key={item.player.id}
                          className="flex items-center justify-between text-[11px]"
                        >
                          <span className="truncate text-slate-200">
                            {item.player.name}{' '}
                            <span className="text-slate-500">
                              ({item.player.role})
                            </span>
                          </span>
                          <span className="font-mono text-emerald-400">
                            {formatINR(item.priceLakhs)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
