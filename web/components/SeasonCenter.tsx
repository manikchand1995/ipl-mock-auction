'use client';

import {
  BarChart3,
  Calendar,
  Search,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  InningsScorecard,
  SeasonSimulationResult,
  SimulatedMatchResult,
  TeamState,
} from '@shared/types';

interface SeasonCenterProps {
  season: SeasonSimulationResult;
  teams: Record<string, TeamState>;
  onSelectPlayer?: (playerId: string) => void;
}

type CenterTab = 'OVERVIEW' | 'TIMETABLE' | 'PLAYER_STATS' | 'TEAM_STATS';
type PlayerStatSort = 'RUNS' | 'WICKETS' | 'SIXES' | 'ECONOMY';

function ImpactArrow({
  playerId,
  sub,
}: {
  playerId: string;
  sub?: InningsScorecard['battingImpactSub'];
}) {
  if (!sub) return null;
  if (sub.inPlayerId === playerId) {
    return (
      <span
        className="ml-1 inline-flex items-center text-[11px] font-black text-emerald-400"
        title={`Impact Player IN (replaced ${sub.outPlayerName})`}
      >
        ▲
      </span>
    );
  }
  if (sub.outPlayerId === playerId) {
    return (
      <span
        className="ml-1 inline-flex items-center text-[11px] font-black text-rose-400"
        title={`Replaced by Impact Player (${sub.inPlayerName})`}
      >
        ▼
      </span>
    );
  }
  return null;
}

function InningsTable({
  innings,
  teams,
  onSelectPlayer,
}: {
  innings: InningsScorecard;
  teams: Record<string, TeamState>;
  onSelectPlayer?: (playerId: string) => void;
}) {
  const batTeam = teams[innings.battingTeamId];
  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <span className="text-sm font-black text-white">
          {batTeam?.franchise.name} Innings
        </span>
        <span className="font-mono text-sm font-black text-amber-300">
          {innings.totalRuns}/{innings.wickets} ({innings.overs} Ov)
        </span>
      </div>

      {/* Batting */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 text-[11px] text-slate-400 uppercase">
            <tr>
              <th className="py-1.5 pr-2">Batter</th>
              <th className="py-1.5 pr-2">Dismissal</th>
              <th className="px-2 py-1.5 text-right">R</th>
              <th className="px-2 py-1.5 text-right">B</th>
              <th className="px-2 py-1.5 text-right">4s</th>
              <th className="px-2 py-1.5 text-right">6s</th>
              <th className="py-1.5 pl-2 text-right">SR</th>
            </tr>
          </thead>
          <tbody>
            {innings.batters.map((b) => (
              <tr key={b.playerId} className="border-b border-slate-800/50">
                <td className="py-1.5 pr-2 font-semibold text-white">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer?.(b.playerId)}
                    className="text-left transition hover:text-amber-300 hover:underline"
                  >
                    {b.name}
                  </button>
                  <ImpactArrow playerId={b.playerId} sub={innings.battingImpactSub} />
                </td>
                <td className="py-1.5 pr-2 text-[11px] text-slate-400">
                  {b.outText}
                </td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-300">
                  {b.runs}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-300">
                  {b.balls}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-400">
                  {b.fours}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-400">
                  {b.sixes}
                </td>
                <td className="py-1.5 pl-2 text-right font-mono text-slate-300">
                  {b.strikeRate.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1.5 text-[11px] text-slate-400">
        <div>
          Extras: <strong className="text-slate-200">{innings.extras}</strong>
        </div>
        {innings.yetToBat && innings.yetToBat.length > 0 && (
          <div className="rounded-lg border border-slate-800/80 bg-slate-900/50 px-2.5 py-1.5 leading-relaxed">
            <span className="font-semibold text-slate-300">Yet to Bat: </span>
            {innings.yetToBat.map((p, idx) => (
              <span key={p.playerId}>
                <button
                  type="button"
                  onClick={() => onSelectPlayer?.(p.playerId)}
                  className="text-slate-200 transition hover:text-amber-300 hover:underline"
                >
                  {p.name}
                </button>
                <ImpactArrow playerId={p.playerId} sub={innings.battingImpactSub} />
                {idx < innings.yetToBat!.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bowling */}
      <div className="overflow-x-auto pt-1">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 text-[11px] text-slate-400 uppercase">
            <tr>
              <th className="py-1.5 pr-2">Bowler</th>
              <th className="px-2 py-1.5 text-right">O</th>
              <th className="px-2 py-1.5 text-right">R</th>
              <th className="px-2 py-1.5 text-right">W</th>
              <th className="py-1.5 pl-2 text-right">Econ</th>
            </tr>
          </thead>
          <tbody>
            {innings.bowlers.map((bw) => (
              <tr key={bw.playerId} className="border-b border-slate-800/50">
                <td className="py-1.5 pr-2 font-semibold text-white">
                  <button
                    type="button"
                    onClick={() => onSelectPlayer?.(bw.playerId)}
                    className="text-left transition hover:text-amber-300 hover:underline"
                  >
                    {bw.name}
                  </button>
                  <ImpactArrow playerId={bw.playerId} sub={innings.bowlingImpactSub} />
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-300">
                  {bw.overs}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-300">
                  {bw.runs}
                </td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-400">
                  {bw.wickets}
                </td>
                <td className="py-1.5 pl-2 text-right font-mono text-slate-300">
                  {bw.economy.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SeasonCenter({
  season,
  teams,
  onSelectPlayer,
}: SeasonCenterProps) {
  const [tab, setTab] = useState<CenterTab>('OVERVIEW');
  const [selectedMatch, setSelectedMatch] =
    useState<SimulatedMatchResult | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [stageFilter, setStageFilter] = useState<'ALL' | 'LEAGUE' | 'PLAYOFFS'>(
    'ALL'
  );
  const [statSort, setStatSort] = useState<PlayerStatSort>('RUNS');
  const [playerSearch, setPlayerSearch] = useState('');

  const orangeCap = useMemo(
    () => [...season.playerStats].sort((a, b) => b.runs - a.runs)[0],
    [season.playerStats]
  );
  const purpleCap = useMemo(
    () =>
      [...season.playerStats].sort(
        (a, b) => b.wickets - a.wickets || a.economy - b.economy
      )[0],
    [season.playerStats]
  );

  const filteredMatches = useMemo(() => {
    return season.matches.filter((m) => {
      if (
        teamFilter !== 'ALL' &&
        m.homeTeamId !== teamFilter &&
        m.awayTeamId !== teamFilter
      ) {
        return false;
      }
      if (stageFilter === 'LEAGUE' && m.stage !== 'LEAGUE') return false;
      if (stageFilter === 'PLAYOFFS' && m.stage === 'LEAGUE') return false;
      return true;
    });
  }, [season.matches, teamFilter, stageFilter]);

  const sortedPlayerStats = useMemo(() => {
    return season.playerStats
      .filter((p) => {
        if (teamFilter !== 'ALL' && p.teamId !== teamFilter) return false;
        if (
          playerSearch.trim() &&
          !p.name.toLowerCase().includes(playerSearch.trim().toLowerCase())
        ) {
          return false;
        }
        if (statSort === 'ECONOMY' && p.oversBowled < 8) return false;
        return true;
      })
      .sort((a, b) => {
        if (statSort === 'RUNS') return b.runs - a.runs;
        if (statSort === 'WICKETS')
          return b.wickets - a.wickets || a.economy - b.economy;
        if (statSort === 'SIXES') return b.sixes - a.sixes || b.runs - a.runs;
        return a.economy - b.economy || b.wickets - a.wickets;
      })
      .slice(0, 40);
  }, [season.playerStats, teamFilter, playerSearch, statSort]);

  return (
    <div className="space-y-6 rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-[#0d1d24] to-slate-950 p-5 md:p-6">
      {/* Champion & Cap Leaders Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300">
            <Trophy className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-bold tracking-widest text-amber-300 uppercase">
              Simulated IPL Champions
            </div>
            <h2 className="text-2xl font-black text-white">
              {teams[season.championTeamId]?.franchise.name}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 text-xs">
          {orangeCap && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3.5 py-2">
              <span className="font-bold text-orange-300">🟠 Orange Cap: </span>
              <button
                type="button"
                onClick={() => onSelectPlayer?.(orangeCap.playerId)}
                className="font-bold text-white transition hover:text-amber-300 hover:underline"
              >
                {orangeCap.name}
              </button>{' '}
              <span className="text-slate-300">
                ({teams[orangeCap.teamId]?.franchise.shortName} • {orangeCap.runs}{' '}
                runs)
              </span>
            </div>
          )}
          {purpleCap && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-3.5 py-2">
              <span className="font-bold text-purple-300">🟣 Purple Cap: </span>
              <button
                type="button"
                onClick={() => onSelectPlayer?.(purpleCap.playerId)}
                className="font-bold text-white transition hover:text-amber-300 hover:underline"
              >
                {purpleCap.name}
              </button>{' '}
              <span className="text-slate-300">
                ({teams[purpleCap.teamId]?.franchise.shortName} •{' '}
                {purpleCap.wickets} wkts)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Cricbuzz-style Navigation Tabs */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            { key: 'OVERVIEW', label: 'Points Table & Playoffs', icon: Trophy },
            {
              key: 'TIMETABLE',
              label: `Timetable (${season.matches.length})`,
              icon: Calendar,
            },
            { key: 'PLAYER_STATS', label: 'Player Stats', icon: BarChart3 },
            { key: 'TEAM_STATS', label: 'Team Stats', icon: Users },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 font-bold transition ${
                tab === t.key
                  ? 'bg-amber-400 text-slate-950'
                  : 'border border-slate-800 bg-slate-900/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: POINTS TABLE & PLAYOFFS */}
      {tab === 'OVERVIEW' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              League Standings (Top 4 Qualify)
            </h3>
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-900/90 text-[11px] text-slate-400 uppercase">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-2 py-2 text-center">P</th>
                    <th className="px-2 py-2 text-center">W</th>
                    <th className="px-2 py-2 text-center">L</th>
                    <th className="px-2 py-2 text-right">NRR</th>
                    <th className="px-3 py-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {season.standings.map((row, idx) => {
                    const team = teams[row.teamId];
                    const isPlayoff = idx < 4;
                    return (
                      <tr
                        key={row.teamId}
                        className={`border-b border-slate-800/60 ${
                          idx === 3 ? 'border-b-2 border-emerald-500/50' : ''
                        } ${isPlayoff ? 'bg-emerald-500/5' : ''}`}
                      >
                        <td className="px-3 py-2 font-mono text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 font-bold text-white">
                          {team?.franchise.shortName}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-300">
                          {row.played}
                        </td>
                        <td className="px-2 py-2 text-center text-emerald-400">
                          {row.won}
                        </td>
                        <td className="px-2 py-2 text-center text-rose-400">
                          {row.lost}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-300">
                          {row.nrr >= 0
                            ? `+${row.nrr.toFixed(3)}`
                            : row.nrr.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-300">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              Playoffs &amp; Final (Click for Scorecard)
            </h3>
            <div className="space-y-2.5">
              {season.playoffs.map((m) => {
                const home = teams[m.homeTeamId];
                const away = teams[m.awayTeamId];
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMatch(m)}
                    className={`w-full rounded-2xl border p-3.5 text-left text-xs transition hover:border-amber-400/70 ${
                      m.stage === 'FINAL'
                        ? 'border-amber-400/60 bg-amber-500/10'
                        : 'border-slate-800 bg-slate-950/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-amber-300 uppercase">
                        {m.stage.replace('_', ' ')} • {m.dateLabel}
                      </span>
                      <span className="text-slate-400">{m.stadium}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between font-semibold text-white">
                      <span>
                        {home?.franchise.shortName} {m.homeScore}
                      </span>
                      <span className="text-slate-500">vs</span>
                      <span>
                        {away?.franchise.shortName} {m.awayScore}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      <span className="font-bold text-emerald-400">
                        {m.summary}
                      </span>
                      <span className="text-slate-400">⭐ {m.topPerformer}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TIMETABLE / SCHEDULE */}
      {tab === 'TIMETABLE' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
            >
              <option value="ALL">All Teams</option>
              {Object.values(teams).map((t) => (
                <option key={t.franchise.id} value={t.franchise.id}>
                  {t.franchise.name} ({t.franchise.shortName})
                </option>
              ))}
            </select>
            <select
              value={stageFilter}
              onChange={(e) =>
                setStageFilter(e.target.value as 'ALL' | 'LEAGUE' | 'PLAYOFFS')
              }
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
            >
              <option value="ALL">All Matches</option>
              <option value="LEAGUE">League Stage</option>
              <option value="PLAYOFFS">Playoffs</option>
            </select>
            <span className="text-slate-400">
              Showing <strong className="text-white">{filteredMatches.length}</strong>{' '}
              matches — click any match for full scorecard
            </span>
          </div>

          <div className="grid max-h-[520px] gap-2.5 overflow-y-auto pr-1 md:grid-cols-2">
            {filteredMatches.map((m) => {
              const home = teams[m.homeTeamId];
              const away = teams[m.awayTeamId];
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMatch(m)}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 text-left text-xs transition hover:border-amber-400/70 hover:bg-slate-900/90"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-bold text-amber-300">
                      Match {m.matchNumber} • {m.dateLabel}
                      {m.stage !== 'LEAGUE' ? ` (${m.stage.replace('_', ' ')})` : ''}
                    </span>
                    <span className="truncate pl-2">{m.stadium}</span>
                  </div>
                  <div className="mt-2 space-y-1 font-semibold">
                    <div className="flex justify-between text-white">
                      <span>{home?.franchise.shortName}</span>
                      <span className="font-mono text-slate-200">{m.homeScore}</span>
                    </div>
                    <div className="flex justify-between text-white">
                      <span>{away?.franchise.shortName}</span>
                      <span className="font-mono text-slate-200">{m.awayScore}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[11px]">
                    <span className="font-semibold text-emerald-400">{m.summary}</span>
                    <span className="text-sky-300">Scorecard →</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: PLAYER STATS */}
      {tab === 'PLAYER_STATS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { key: 'RUNS', label: '🟠 Most Runs' },
                  { key: 'WICKETS', label: '🟣 Most Wickets' },
                  { key: 'SIXES', label: '💥 Most Sixes' },
                  { key: 'ECONOMY', label: '🎯 Best Economy (8+ Ov)' },
                ] as const
              ).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStatSort(s.key)}
                  className={`rounded-xl px-3 py-1.5 font-bold transition ${
                    statSort === s.key
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-200"
              >
                <option value="ALL">All Teams</option>
                {Object.values(teams).map((t) => (
                  <option key={t.franchise.id} value={t.franchise.id}>
                    {t.franchise.shortName}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  placeholder="Search player..."
                  className="rounded-xl border border-slate-700 bg-slate-950 py-1.5 pr-3 pl-8 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="max-h-[460px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b border-slate-800 bg-slate-900 text-[11px] text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-2 py-2">Team</th>
                  <th className="px-2 py-2 text-center">Mat</th>
                  <th className="px-2 py-2 text-right">Runs</th>
                  <th className="px-2 py-2 text-right">HS</th>
                  <th className="px-2 py-2 text-right">SR</th>
                  <th className="px-2 py-2 text-right">6s</th>
                  <th className="px-2 py-2 text-right">Wkts</th>
                  <th className="px-2 py-2 text-right">Econ</th>
                  <th className="px-3 py-2 text-right">Best</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayerStats.map((ps, idx) => (
                  <tr
                    key={ps.playerId}
                    className="border-b border-slate-800/50 hover:bg-slate-900/50"
                  >
                    <td className="px-3 py-2 font-mono text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2 font-semibold text-white">
                      <button
                        type="button"
                        onClick={() => onSelectPlayer?.(ps.playerId)}
                        className="text-left transition hover:text-amber-300 hover:underline"
                      >
                        {ps.name}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-slate-300">
                      {teams[ps.teamId]?.franchise.shortName}
                    </td>
                    <td className="px-2 py-2 text-center text-slate-400">
                      {ps.matches}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-bold text-amber-300">
                      {ps.runs}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-slate-300">
                      {ps.highScore}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-slate-300">
                      {ps.strikeRate.toFixed(1)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-slate-300">
                      {ps.sixes}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-bold text-emerald-400">
                      {ps.wickets}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-slate-300">
                      {ps.oversBowled > 0 ? ps.economy.toFixed(2) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {ps.bestBowling}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TEAM STATS */}
      {tab === 'TEAM_STATS' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900 text-[11px] text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2.5">Franchise</th>
                <th className="px-2 py-2.5 text-center">Mat</th>
                <th className="px-2 py-2.5 text-center">Won</th>
                <th className="px-2 py-2.5 text-center">Lost</th>
                <th className="px-2 py-2.5 text-center">Home W</th>
                <th className="px-2 py-2.5 text-center">Away W</th>
                <th className="px-2 py-2.5 text-right">Avg Score</th>
                <th className="px-2 py-2.5 text-right">Highest</th>
                <th className="px-2 py-2.5 text-right">Lowest</th>
                <th className="px-3 py-2.5 text-right">Wkts Taken</th>
              </tr>
            </thead>
            <tbody>
              {[...season.teamStats]
                .sort((a, b) => b.won - a.won || b.avgScore - a.avgScore)
                .map((ts) => {
                  const team = teams[ts.teamId];
                  return (
                    <tr
                      key={ts.teamId}
                      className="border-b border-slate-800/50 hover:bg-slate-900/50"
                    >
                      <td className="px-3 py-2.5 font-bold text-white">
                        {team?.franchise.name} ({team?.franchise.shortName})
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-300">
                        {ts.matches}
                      </td>
                      <td className="px-2 py-2.5 text-center font-bold text-emerald-400">
                        {ts.won}
                      </td>
                      <td className="px-2 py-2.5 text-center text-rose-400">
                        {ts.lost}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-300">
                        {ts.homeWins}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-300">
                        {ts.awayWins}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-amber-300">
                        {ts.avgScore}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-emerald-300">
                        {ts.highestTotal}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-rose-300">
                        {ts.lowestTotal}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-sky-300">
                        {ts.totalWicketsTaken}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* MATCH SCORECARD MODAL */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <div className="text-xs font-bold text-amber-300 uppercase">
                  Match {selectedMatch.matchNumber} • {selectedMatch.dateLabel} •{' '}
                  {selectedMatch.stadium}
                </div>
                <h3 className="mt-0.5 text-lg font-black text-white">
                  {teams[selectedMatch.homeTeamId]?.franchise.shortName} vs{' '}
                  {teams[selectedMatch.awayTeamId]?.franchise.shortName} —{' '}
                  <span className="text-emerald-400">{selectedMatch.summary}</span>
                </h3>
                {selectedMatch.tossSummary && (
                  <div className="mt-1 text-xs text-slate-300">
                    🪙 {selectedMatch.tossSummary}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedMatch(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <InningsTable
                innings={selectedMatch.innings1}
                teams={teams}
                onSelectPlayer={onSelectPlayer}
              />
              <InningsTable
                innings={selectedMatch.innings2}
                teams={teams}
                onSelectPlayer={onSelectPlayer}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
