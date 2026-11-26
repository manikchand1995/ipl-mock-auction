'use client';

import {
  FastForward,
  Gavel,
  ListFilter,
  Pause,
  Play,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AUCTION_SET_LABELS } from '@shared/constants';
import {
  formatINR,
  getNextBidAmountLakhs,
  PLAYING_ROLE_LABELS,
  validateBid,
} from '@shared/rules';
import { PublicRoomState } from '@shared/types';
import AuctionPoolModal from './AuctionPoolModal';

interface BroadcastStageProps {
  state: PublicRoomState;
  playerToken: string;
  muted: boolean;
  onToggleMute: () => void;
  onBid: () => void;
  onRTMCounter: (raiseLakhs: number) => void;
  onRTMDecision: (useRTM: boolean) => void;
  onTogglePause: () => void;
  onSkipLot: () => void;
  onSkip5?: () => void;
  onSkip10?: () => void;
  onSkipSet?: () => void;
  onTriggerAccelerated: () => void;
  onSimulateAuction: () => void;
  onEndAuction: () => void;
}

export default function BroadcastStage({
  state,
  playerToken,
  muted,
  onToggleMute,
  onBid,
  onRTMCounter,
  onRTMDecision,
  onTogglePause,
  onSkipLot,
  onSkip5,
  onSkip10,
  onSkipSet,
  onTriggerAccelerated,
  onSimulateAuction,
  onEndAuction,
}: BroadcastStageProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [statsTab, setStatsTab] = useState<'IPL' | 'LIST_A' | 'FC'>('IPL');
  const [poolOpen, setPoolOpen] = useState(false);

  const currentPlayerId = state.currentLot?.player.id;
  const currentIplMatches = state.currentLot?.player.stats.matches ?? 0;
  const hasListA = Boolean(state.currentLot?.player.stats.listA);

  useEffect(() => {
    setStatsTab(currentIplMatches === 0 && hasListA ? 'LIST_A' : 'IPL');
  }, [currentPlayerId, currentIplMatches, hasListA]);

  useEffect(() => {
    const update = () => {
      if (state.phase === 'PAUSED') {
        setSecondsLeft(Math.ceil(state.timerRemainingMs / 1000));
        return;
      }
      if (!state.timerEndsAt) {
        setSecondsLeft(0);
        return;
      }
      const diff = Math.max(0, state.timerEndsAt - Date.now());
      setSecondsLeft(Math.ceil(diff / 1000));
    };
    update();
    const id = setInterval(update, 120);
    return () => clearInterval(id);
  }, [state.timerEndsAt, state.timerRemainingMs, state.phase]);

  const isHost = state.hostToken === playerToken;
  const myTeam = Object.values(state.teams).find(
    (t) => t.playerToken === playerToken
  );
  const lot = state.currentLot;

  if (!lot) {
    return (
      <div className="flex h-80 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/70 text-slate-400">
        Preparing next player on the block...
      </div>
    );
  }

  const player = lot.player;
  const highestTeam = lot.highestBidderTeamId
    ? state.teams[lot.highestBidderTeamId]
    : null;
  const nextBid = getNextBidAmountLakhs(
    lot.currentBidLakhs,
    lot.highestBidderTeamId,
    player.basePriceLakhs
  );

  const bidCheck = myTeam
    ? validateBid(
        myTeam,
        player,
        nextBid,
        lot.highestBidderTeamId,
        state.config
      )
    : { valid: false, reason: 'Spectating' };

  const isMyRTM =
    state.phase === 'RTM_DECISION' &&
    myTeam &&
    lot.rtmEligibleTeamId === myTeam.franchise.id;

  const rtmTeam = lot.rtmEligibleTeamId
    ? state.teams[lot.rtmEligibleTeamId]
    : null;
  const prevTeam = player.previousTeamId
    ? state.teams[player.previousTeamId]
    : null;
  const prevTeamHasRtm =
    state.config.enableRetentionAndRTM &&
    prevTeam &&
    prevTeam.rtmCardsRemaining > 0;

  const timerColor =
    secondsLeft <= 2
      ? 'text-rose-400 animate-pulse'
      : secondsLeft <= 4
        ? 'text-amber-400'
        : 'text-emerald-400';

  const gavelStatus =
    state.phase === 'PAUSED'
      ? 'PAUSED'
      : secondsLeft <= 1
        ? 'GOING TWICE!'
        : secondsLeft <= 3
          ? 'GOING ONCE...'
          : 'BIDDING OPEN';

  return (
    <div className="relative flex flex-col gap-4">
      {/* Top Broadcast Ticker */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-amber-500/20 px-2.5 py-1 font-bold text-amber-300 uppercase">
            {state.currentSet ? AUCTION_SET_LABELS[state.currentSet] : 'Live'}
          </span>
          <span className="text-slate-400">
            Sold: <strong className="text-white">{state.soldCount}</strong> • Unsold:{' '}
            <strong className="text-white">{state.unsoldCount}</strong> • Queue:{' '}
            <strong className="text-white">{state.remainingQueueCount}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPoolOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 font-semibold text-slate-200 hover:bg-slate-700"
            title="View upcoming and unsold players"
          >
            <ListFilter className="h-3.5 w-3.5 text-amber-400" /> Pool ({state.remainingQueueCount})
          </button>

          <button
            onClick={onToggleMute}
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
            title={muted ? 'Unmute SFX' : 'Mute SFX'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {isHost && (
            <>
              <button
                onClick={onTogglePause}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 font-semibold text-slate-200 hover:bg-slate-700"
              >
                {state.phase === 'PAUSED' ? (
                  <>
                    <Play className="h-3.5 w-3.5 text-emerald-400" /> Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5 text-amber-400" /> Pause
                  </>
                )}
              </button>
              <button
                onClick={onSkipLot}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 font-semibold text-slate-200 hover:bg-slate-700"
                title="Simulate this player across other teams"
              >
                <SkipForward className="h-3.5 w-3.5" /> Skip
              </button>
              {state.config.mode === 'SINGLE_PLAYER' && (
                <>
                  <button
                    onClick={onSkip5}
                    disabled={state.phase !== 'BIDDING'}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                    title="Simulate next 5 players across AI teams"
                  >
                    Skip 5
                  </button>
                  <button
                    onClick={onSkip10}
                    disabled={state.phase !== 'BIDDING'}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                    title="Simulate next 10 players across AI teams"
                  >
                    Skip 10
                  </button>
                  <button
                    onClick={onSkipSet}
                    disabled={state.phase !== 'BIDDING'}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 font-semibold text-amber-300 hover:bg-slate-700 disabled:opacity-40"
                    title="Simulate remaining players in the current set across AI teams"
                  >
                    Skip Set
                  </button>
                </>
              )}
              {state.currentSet !== 'ACCELERATED' && (
                <button
                  onClick={onTriggerAccelerated}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 font-semibold text-sky-300 hover:bg-slate-700"
                >
                  <FastForward className="h-3.5 w-3.5" /> Accelerated
                </button>
              )}
              <button
                onClick={onSimulateAuction}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 font-semibold text-emerald-300 hover:bg-emerald-500/25"
                title="Auto-simulate all remaining lots in the auction"
              >
                <Zap className="h-3.5 w-3.5" /> Simulate
              </button>
              <button
                onClick={onEndAuction}
                className="flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1.5 font-semibold text-rose-300 hover:bg-rose-500/25"
              >
                <Square className="h-3.5 w-3.5" /> End
              </button>
            </>
          )}
        </div>
      </div>

      {/* Home Ground Tactical Reminder */}
      {myTeam && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-3.5 py-2 text-[11px] text-slate-300">
          <span>
            🏟️ <strong className="text-white">{myTeam.franchise.homeGround.stadium}</strong>{' '}
            <span className="text-sky-300">({myTeam.franchise.homeGround.pitchLabel})</span>
          </span>
          <span className="text-slate-400">{myTeam.franchise.homeGround.summary}</span>
        </div>
      )}

      <AuctionPoolModal
        open={poolOpen}
        onClose={() => setPoolOpen(false)}
        upcomingPlayerIds={state.upcomingPlayerIds}
        unsoldPlayerIds={state.unsoldPlayerIds}
      />

      {/* Main Broadcast Stage Card */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-700/80 bg-gradient-to-br from-slate-900 via-[#0f1930] to-slate-950 p-5 shadow-2xl md:p-7">
        {/* SOLD / UNSOLD Gavel Overlay */}
        {(state.phase === 'SOLD_REVEAL' || state.phase === 'UNSOLD_REVEAL') && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <div
              className={`animate-gavel-stamp rounded-2xl border-4 px-8 py-4 text-4xl font-black tracking-widest uppercase shadow-2xl md:text-5xl ${
                state.phase === 'SOLD_REVEAL'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                  : 'border-rose-400 bg-rose-500/20 text-rose-300'
              }`}
            >
              {state.phase === 'SOLD_REVEAL'
                ? lot.rtmEligibleTeamId === lot.highestBidderTeamId
                  ? 'SOLD (RTM)!'
                  : 'SOLD!'
                : 'UNSOLD'}
            </div>
            {state.phase === 'SOLD_REVEAL' && highestTeam && (
              <p className="mt-4 text-lg font-bold text-white">
                {player.name} →{' '}
                <span className="text-amber-400">{highestTeam.franchise.name}</span>{' '}
                for {formatINR(lot.currentBidLakhs)}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-5">
          {/* Player Spotlight (3 cols) */}
          <div className="space-y-4 md:col-span-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-sky-500/20 px-2.5 py-1 text-xs font-bold text-sky-300">
                {player.playingRole
                  ? PLAYING_ROLE_LABELS[player.playingRole]
                  : player.role}
              </span>
              <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
                {player.country} {player.isOverseas ? '✈️ Overseas' : '🇮🇳 Domestic'}
              </span>
              {player.isUncapped && (
                <span className="rounded-md bg-purple-500/20 px-2.5 py-1 text-xs font-bold text-purple-300">
                  Uncapped
                </span>
              )}
              <span className="rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300">
                OVR {player.ratings.overall}
              </span>
              {prevTeam && (
                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                    prevTeamHasRtm
                      ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                  title={
                    prevTeamHasRtm
                      ? `${prevTeam.franchise.name} has ${prevTeam.rtmCardsRemaining} RTM card(s) left`
                      : `${prevTeam.franchise.name} (previous franchise)`
                  }
                >
                  Prev: {prevTeam.franchise.shortName}
                  {state.config.enableRetentionAndRTM
                    ? ` • ${prevTeam.rtmCardsRemaining} RTM`
                    : ''}
                </span>
              )}
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
                {player.name}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {player.battingStyle}
                {player.bowlingStyle !== 'None' ? ` • ${player.bowlingStyle}` : ''}
              </p>
            </div>

            {/* Stats Format Tabs & Grid */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                {(
                  [
                    { key: 'IPL', label: 'IPL', available: true },
                    { key: 'LIST_A', label: 'List A', available: Boolean(player.stats.listA) },
                    { key: 'FC', label: 'First-Class', available: Boolean(player.stats.fc) },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    disabled={!tab.available}
                    onClick={() => setStatsTab(tab.key)}
                    className={`rounded-lg px-2.5 py-1 transition ${
                      statsTab === tab.key
                        ? 'bg-amber-400 text-slate-950'
                        : tab.available
                          ? 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                          : 'cursor-not-allowed bg-slate-900/50 text-slate-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {(() => {
                const activeStats =
                  statsTab === 'LIST_A' && player.stats.listA
                    ? player.stats.listA
                    : statsTab === 'FC' && player.stats.fc
                      ? player.stats.fc
                      : player.stats;
                const isBowler = player.role === 'BOWL';
                const thirdLabel = isBowler
                  ? 'Economy'
                  : statsTab === 'IPL'
                    ? 'Strike Rate'
                    : 'Average';
                const thirdVal = isBowler
                  ? activeStats.economy ?? '-'
                  : statsTab === 'IPL'
                    ? activeStats.strikeRate ?? '-'
                    : ('average' in activeStats ? activeStats.average : undefined) ??
                      activeStats.strikeRate ??
                      '-';

                return (
                  <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 text-center">
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase">Matches</div>
                      <div className="mt-0.5 text-lg font-bold text-white">
                        {activeStats.matches}
                      </div>
                    </div>
                    {!isBowler && activeStats.runs !== undefined ? (
                      <>
                        <div>
                          <div className="text-[11px] text-slate-400 uppercase">Runs</div>
                          <div className="mt-0.5 text-lg font-bold text-white">
                            {activeStats.runs}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-400 uppercase">{thirdLabel}</div>
                          <div className="mt-0.5 text-lg font-bold text-amber-300">
                            {thirdVal}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <div className="text-[11px] text-slate-400 uppercase">Wickets</div>
                          <div className="mt-0.5 text-lg font-bold text-white">
                            {activeStats.wickets ?? 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-400 uppercase">{thirdLabel}</div>
                          <div className="mt-0.5 text-lg font-bold text-amber-300">
                            {thirdVal}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Attribute Bars */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              {[
                { label: 'Batting', val: player.ratings.batting },
                { label: 'Bowling', val: player.ratings.bowling },
                { label: 'Fielding', val: player.ratings.fielding },
              ].map((attr) => (
                <div key={attr.label}>
                  <div className="mb-1 flex justify-between text-slate-400">
                    <span>{attr.label}</span>
                    <span className="font-bold text-slate-200">{attr.val}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400"
                      style={{ width: `${attr.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Bidding & Timer (2 cols) */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/75 p-4 md:col-span-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                  {gavelStatus}
                </span>
                <span className={`font-mono text-2xl font-black ${timerColor}`}>
                  {secondsLeft}s
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 text-center">
                <div className="text-xs text-slate-400">
                  {highestTeam ? 'CURRENT HIGHEST BID' : 'BASE PRICE'}
                </div>
                <div className="mt-1 font-mono text-3xl font-black text-amber-400">
                  {formatINR(lot.currentBidLakhs)}
                </div>
                {highestTeam ? (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-white">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: highestTeam.franchise.primaryColor }}
                    />
                    {highestTeam.franchise.name}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-slate-500">
                    No bids placed yet
                  </div>
                )}
              </div>
            </div>

            {/* Action Area: RTM or Bid Button */}
            <div className="mt-4 space-y-2.5">
              {state.phase === 'RTM_COUNTER' && rtmTeam ? (
                <div className="rounded-xl border border-sky-400/50 bg-sky-500/10 p-3 text-center">
                  <div className="text-xs font-bold text-sky-300 uppercase">
                    RTM Final Counter-Offer
                  </div>
                  <p className="mt-1 text-xs text-slate-200">
                    {rtmTeam.franchise.shortName} holds RTM!{' '}
                    {highestTeam?.franchise.shortName} can raise once before RTM.
                  </p>
                  {myTeam && lot.highestBidderTeamId === myTeam.franchise.id && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        onClick={() => onRTMCounter(50)}
                        className="rounded-lg bg-amber-400 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300"
                      >
                        +₹50 L
                      </button>
                      <button
                        onClick={() => onRTMCounter(100)}
                        className="rounded-lg bg-amber-400 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300"
                      >
                        +₹1 Cr
                      </button>
                      <button
                        onClick={() => onRTMCounter(0)}
                        className="rounded-lg bg-slate-700 py-2 text-xs font-bold text-white hover:bg-slate-600"
                      >
                        Keep
                      </button>
                    </div>
                  )}
                </div>
              ) : state.phase === 'RTM_DECISION' && rtmTeam ? (
                <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-center">
                  <div className="text-xs font-bold text-amber-300 uppercase">
                    {lot.rtmCounterUsed ? 'Final Right To Match (RTM)' : 'Right To Match (RTM)'}
                  </div>
                  <p className="mt-1 text-xs text-slate-200">
                    {lot.rtmCounterUsed ? (
                      <>
                        Can <strong>{rtmTeam.franchise.shortName}</strong> match the raised offer of{' '}
                        {formatINR(lot.currentBidLakhs)}?
                      </>
                    ) : (
                      <>
                        Will <strong>{rtmTeam.franchise.shortName}</strong> exercise RTM at{' '}
                        {formatINR(lot.currentBidLakhs)}?
                      </>
                    )}
                  </p>
                  {isMyRTM && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onRTMDecision(true)}
                        className="rounded-lg bg-emerald-500 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                      >
                        Use RTM
                      </button>
                      <button
                        onClick={() => onRTMDecision(false)}
                        className="rounded-lg bg-slate-700 py-2 text-xs font-bold text-white hover:bg-slate-600"
                      >
                        Pass
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <button
                    disabled={!bidCheck.valid || state.phase !== 'BIDDING'}
                    onClick={onBid}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black tracking-wide uppercase shadow-lg transition ${
                      bidCheck.valid && state.phase === 'BIDDING'
                        ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-amber-500/20 hover:brightness-110 active:scale-[0.99]'
                        : 'cursor-not-allowed bg-slate-800 text-slate-500'
                    }`}
                  >
                    <Gavel className="h-4 w-4" />
                    {lot.highestBidderTeamId
                      ? `Bid ${formatINR(nextBid)}`
                      : `Open Bid ${formatINR(nextBid)}`}
                  </button>
                  {!bidCheck.valid && bidCheck.reason && (
                    <p className="text-center text-[11px] text-rose-400">
                      {bidCheck.reason}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Recent Bid History Strip */}
        {lot.bidHistory.length > 0 && (
          <div className="mt-5 flex items-center gap-2 overflow-x-auto border-t border-slate-800/80 pt-3 text-xs">
            <span className="shrink-0 font-semibold text-slate-500">BIDS:</span>
            {lot.bidHistory.slice(0, 6).map((b, idx) => (
              <span
                key={`${b.teamId}-${b.timestamp}-${idx}`}
                className={`shrink-0 rounded-full px-2.5 py-1 font-mono ${
                  idx === 0
                    ? 'bg-amber-400/20 font-bold text-amber-300'
                    : 'bg-slate-800/80 text-slate-400'
                }`}
              >
                {b.teamShortName} {formatINR(b.amountLakhs)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
