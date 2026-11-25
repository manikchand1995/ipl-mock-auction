'use client';

import { useState } from 'react';
import { formatINR, getOverseasCount } from '@shared/rules';
import { PublicRoomState } from '@shared/types';

interface FranchiseSidebarProps {
  state: PublicRoomState;
  playerToken: string;
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

              {isExpanded && (
                <div className="border-t border-slate-800/80 px-3 py-2 text-xs">
                  {team.squad.length === 0 ? (
                    <div className="py-1 text-slate-500">No players yet.</div>
                  ) : (
                    <div className="max-h-40 space-y-1 overflow-y-auto">
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
