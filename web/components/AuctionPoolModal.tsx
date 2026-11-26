'use client';

import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import playersData from '@shared/data/players.json';
import { AUCTION_SET_LABELS, AUCTION_SET_ORDER } from '@shared/constants';
import { formatINR } from '@shared/rules';
import { AuctionSet, Player, PlayerRole } from '@shared/types';

interface AuctionPoolModalProps {
  open: boolean;
  onClose: () => void;
  upcomingPlayerIds: string[];
  unsoldPlayerIds: string[];
}

export default function AuctionPoolModal({
  open,
  onClose,
  upcomingPlayerIds,
  unsoldPlayerIds,
}: AuctionPoolModalProps) {
  const [tab, setTab] = useState<'UPCOMING' | 'UNSOLD'>('UPCOMING');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<PlayerRole | 'ALL'>('ALL');
  const [setFilter, setSetFilter] = useState<AuctionSet | 'ALL'>('ALL');

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of playersData as Player[]) {
      map.set(p.id, p);
    }
    return map;
  }, []);

  const list = useMemo(() => {
    const ids = tab === 'UPCOMING' ? upcomingPlayerIds : unsoldPlayerIds;
    return ids
      .map((id) => playerMap.get(id))
      .filter((p): p is Player => Boolean(p))
      .filter((p) => {
        if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
        if (tab === 'UPCOMING' && setFilter !== 'ALL' && p.set !== setFilter)
          return false;
        if (
          search.trim() &&
          !p.name.toLowerCase().includes(search.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      });
  }, [tab, upcomingPlayerIds, unsoldPlayerIds, playerMap, roleFilter, setFilter, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-white">Auction Register</h2>
            <p className="text-xs text-slate-400">
              Plan your purse by scouting remaining sets and unsold players
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs & Filters */}
        <div className="space-y-3 border-b border-slate-800 p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setTab('UPCOMING')}
                className={`rounded-xl px-3.5 py-2 font-bold transition ${
                  tab === 'UPCOMING'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Upcoming ({upcomingPlayerIds.length})
              </button>
              <button
                onClick={() => setTab('UNSOLD')}
                className={`rounded-xl px-3.5 py-2 font-bold transition ${
                  tab === 'UNSOLD'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Unsold Pool ({unsoldPlayerIds.length})
              </button>
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search player..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pr-3 pl-8 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as PlayerRole | 'ALL')}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-200"
            >
              <option value="ALL">All Roles</option>
              <option value="BAT">Batters</option>
              <option value="AR">All-Rounders</option>
              <option value="WK">Wicketkeepers</option>
              <option value="BOWL">Bowlers</option>
            </select>

            {tab === 'UPCOMING' && (
              <select
                value={setFilter}
                onChange={(e) => setSetFilter(e.target.value as AuctionSet | 'ALL')}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-200"
              >
                <option value="ALL">All Sets</option>
                {AUCTION_SET_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {AUCTION_SET_LABELS[s]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Player List */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {list.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No players match your filters.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-semibold text-white">
                      {p.name}
                      {p.isOverseas && <span>✈️</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {p.role} • OVR {p.ratings.overall} •{' '}
                      {AUCTION_SET_LABELS[p.set]}
                      {p.previousTeamId ? ` • Prev: ${p.previousTeamId.toUpperCase()}` : ''}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-amber-300">
                    {formatINR(p.basePriceLakhs)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
