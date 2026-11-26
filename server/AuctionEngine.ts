import { v4 as uuidv4 } from 'uuid';
import playersData from '../shared/data/players.json';
import {
  AI_PERSONALITIES,
  AUCTION_SET_LABELS,
  AUCTION_SET_ORDER,
  IPL_FRANCHISES,
} from '../shared/constants';
import {
  calculateRetentionCostLakhs,
  formatINR,
  getBidIncrementLakhs,
  getMaxAllowedBidLakhs,
  getNextBidAmountLakhs,
  getOverseasCount,
  validateBid,
} from '../shared/rules';
import {
  AuctionPhase,
  AuctionSet,
  ChatMessage,
  CurrentLot,
  FloatingReaction,
  Player,
  PublicRoomState,
  RoomConfig,
  SeasonSimulationResult,
  TeamGrade,
  TeamState,
} from '../shared/types';
import {
  computeAIMaxValuationLakhs,
  shouldAIBid,
  shouldAIUseRTM,
} from './AIBiddingAgent';
import { simulateIPLSeason } from './SeasonSimulator';
import { gradeTeamSquad } from './SquadGrader';

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface EngineCallbacks {
  onStateChange: (roomCode: string, state: PublicRoomState) => void;
  onReaction: (roomCode: string, reaction: FloatingReaction) => void;
}

export class AuctionEngine {
  public readonly roomCode: string;
  public hostToken: string;
  public config: RoomConfig;
  public phase: AuctionPhase = 'LOBBY';
  public previousPhaseBeforePause: AuctionPhase | null = null;
  public teams: Record<string, TeamState> = {};
  public currentLot: CurrentLot | null = null;
  public timerEndsAt: number | null = null;
  public currentSet: AuctionSet | 'ACCELERATED' | null = null;
  public retentionReadyTeams: Set<string> = new Set();
  public chatMessages: ChatMessage[] = [];
  public grades: Record<string, TeamGrade> | null = null;
  public seasonResult: SeasonSimulationResult | null = null;

  private playerQueue: Player[] = [];
  private unsoldPool: Player[] = [];
  private soldCount = 0;
  private isAcceleratedMode = false;
  private tickInterval: NodeJS.Timeout | null = null;
  private aiTimeout: NodeJS.Timeout | null = null;
  private phaseTimeout: NodeJS.Timeout | null = null;
  private callbacks: EngineCallbacks;
  public lastActivityAt = Date.now();

  constructor(
    roomCode: string,
    hostToken: string,
    config: RoomConfig,
    callbacks: EngineCallbacks
  ) {
    this.roomCode = roomCode;
    this.hostToken = hostToken;
    this.config = { ...config };
    this.callbacks = callbacks;

    IPL_FRANCHISES.forEach((franchise, idx) => {
      this.teams[franchise.id] = {
        franchise,
        ownerType: 'AI',
        ownerName: `${franchise.shortName} AI`,
        playerToken: null,
        isConnected: true,
        aiPersonality: AI_PERSONALITIES[idx % AI_PERSONALITIES.length],
        remainingPurseLakhs: this.config.totalPurseLakhs,
        rtmCardsRemaining: this.config.enableRetentionAndRTM
          ? this.config.maxRetentionsAndRTM
          : 0,
        squad: [],
      };
    });
  }

  public getPublicState(): PublicRoomState {
    const now = Date.now();
    return {
      roomCode: this.roomCode,
      hostToken: this.hostToken,
      config: this.config,
      phase: this.phase,
      previousPhaseBeforePause: this.previousPhaseBeforePause,
      teams: this.teams,
      currentLot: this.currentLot,
      timerEndsAt: this.timerEndsAt,
      timerRemainingMs: this.timerEndsAt ? Math.max(0, this.timerEndsAt - now) : 0,
      currentSet: this.currentSet,
      remainingQueueCount: this.playerQueue.length,
      unsoldCount: this.unsoldPool.length,
      soldCount: this.soldCount,
      upcomingPlayerIds: this.playerQueue.map((p) => p.id),
      unsoldPlayerIds: this.unsoldPool.map((p) => p.id),
      retentionReadyTeams: Array.from(this.retentionReadyTeams),
      chatMessages: this.chatMessages.slice(-60),
      grades: this.grades,
      seasonResult: this.seasonResult,
    };
  }

  private emitState(): void {
    this.lastActivityAt = Date.now();
    this.callbacks.onStateChange(this.roomCode, this.getPublicState());
  }

  public addSystemMessage(text: string): void {
    this.chatMessages.push({
      id: uuidv4(),
      senderName: 'Auctioneer',
      teamShortName: null,
      text,
      timestamp: Date.now(),
      isSystem: true,
    });
  }

  public updateConfig(newConfig: Partial<RoomConfig>): void {
    if (this.phase !== 'LOBBY') return;
    this.config = { ...this.config, ...newConfig };
    for (const team of Object.values(this.teams)) {
      team.remainingPurseLakhs = this.config.totalPurseLakhs;
      team.rtmCardsRemaining = this.config.enableRetentionAndRTM
        ? this.config.maxRetentionsAndRTM
        : 0;
    }
    this.emitState();
  }

  public assignHumanToTeam(
    teamId: string,
    playerToken: string,
    ownerName: string
  ): boolean {
    if (this.phase !== 'LOBBY') return false;
    const target = this.teams[teamId];
    if (!target || target.ownerType === 'HUMAN') return false;

    // Release any team previously held by this playerToken
    for (const team of Object.values(this.teams)) {
      if (team.playerToken === playerToken) {
        team.ownerType = 'AI';
        team.ownerName = `${team.franchise.shortName} AI`;
        team.playerToken = null;
        team.isConnected = true;
      }
    }

    target.ownerType = 'HUMAN';
    target.ownerName = ownerName;
    target.playerToken = playerToken;
    target.isConnected = true;
    this.emitState();
    return true;
  }

  public releaseHumanTeam(playerToken: string): TeamState | null {
    const team = this.getTeamByToken(playerToken);
    if (!team) return null;

    team.ownerType = 'AI';
    team.ownerName = `${team.franchise.shortName} AI`;
    team.playerToken = null;
    team.isConnected = true;

    if (this.phase === 'RETENTION') {
      if (!this.retentionReadyTeams.has(team.franchise.id)) {
        this.autoSelectAIRetentionForTeam(team);
      }
      const allHumansReady = Object.values(this.teams)
        .filter((t) => t.ownerType === 'HUMAN')
        .every((t) => this.retentionReadyTeams.has(t.franchise.id));

      if (allHumansReady) {
        this.beginLiveBidding();
        return team;
      }
    } else if (this.phase === 'BIDDING') {
      this.scheduleNextAIBid();
    } else if (
      this.phase === 'RTM_COUNTER' &&
      this.currentLot?.highestBidderTeamId === team.franchise.id
    ) {
      this.aiTimeout = setTimeout(() => {
        this.submitRTMCounter(team.franchise.id, 0);
      }, 600);
    } else if (
      this.phase === 'RTM_DECISION' &&
      this.currentLot?.rtmEligibleTeamId === team.franchise.id
    ) {
      const offer =
        this.currentLot.rtmFinalOfferLakhs ?? this.currentLot.currentBidLakhs;
      const willUse = shouldAIUseRTM(
        team,
        this.currentLot.player,
        offer,
        this.config
      );
      this.aiTimeout = setTimeout(() => {
        this.resolveRTMDecision(willUse);
      }, 600);
    }

    this.emitState();
    return team;
  }

  public getTeamByToken(playerToken: string): TeamState | undefined {
    return Object.values(this.teams).find((t) => t.playerToken === playerToken);
  }

  public startAuction(): void {
    if (this.phase !== 'LOBBY') return;
    this.buildInitialQueue();

    if (this.config.enableRetentionAndRTM) {
      this.phase = 'RETENTION';
      this.autoSelectAIRetentions();
      this.addSystemMessage(
        'Retention phase started! Select your retained players or lock in to begin bidding.'
      );
      this.emitState();
    } else {
      this.beginLiveBidding();
    }
  }

  private buildInitialQueue(): void {
    const allPlayers = playersData as Player[];
    const ordered: Player[] = [];
    for (const set of AUCTION_SET_ORDER) {
      const setPlayers = allPlayers.filter((p) => p.set === set);
      ordered.push(...shuffleArray(setPlayers));
    }
    this.playerQueue = ordered;
  }

  private autoSelectAIRetentions(): void {
    for (const team of Object.values(this.teams)) {
      if (team.ownerType !== 'AI') continue;
      if (this.retentionReadyTeams.has(team.franchise.id)) continue;
      this.autoSelectAIRetentionForTeam(team);
    }
  }

  private autoSelectAIRetentionForTeam(team: TeamState): void {
    const retainedIds = new Set<string>();
    // AI retains only players worth their retention slab (90+ for 18Cr, 88+ for 14Cr, 86+ for 11Cr)
    const eligible = (playersData as Player[])
      .filter((p) => p.previousTeamId === team.franchise.id && p.ratings.overall >= 86)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);

    const chosen: Player[] = [];
    let overseas = 0;
    const limit = Math.min(3, this.config.maxRetentionsAndRTM);
    const minThresholds = [90, 88, 86];
    for (const p of eligible) {
      if (chosen.length >= limit) break;
      if (p.isOverseas && overseas >= 2) continue;
      const threshold = minThresholds[chosen.length] ?? 86;
      if (!p.isUncapped && p.ratings.overall < threshold) continue;
      chosen.push(p);
      if (p.isOverseas) overseas++;
    }

    if (chosen.length > 0) {
      const cost = calculateRetentionCostLakhs(chosen);
      if (cost <= team.remainingPurseLakhs - 4000) {
        this.applyRetentionsToTeam(team, chosen);
        chosen.forEach((p) => retainedIds.add(p.id));
      }
    }
    this.retentionReadyTeams.add(team.franchise.id);

    // Remove AI retained players from queue
    if (retainedIds.size > 0) {
      this.playerQueue = this.playerQueue.filter((p) => !retainedIds.has(p.id));
    }
  }

  public submitHumanRetention(teamId: string, playerIds: string[]): string | null {
    if (this.phase !== 'RETENTION') return 'Not in retention phase';
    const team = this.teams[teamId];
    if (!team) return 'Invalid team';
    if (this.retentionReadyTeams.has(teamId)) return 'Retentions already locked';

    if (playerIds.length > this.config.maxRetentionsAndRTM) {
      return `Max ${this.config.maxRetentionsAndRTM} retentions allowed`;
    }

    const allPlayers = playersData as Player[];
    const chosen = playerIds
      .map((id) => allPlayers.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p && p.previousTeamId === teamId));

    const cappedCount = chosen.filter((p) => !p.isUncapped).length;
    const uncappedCount = chosen.filter((p) => p.isUncapped).length;
    if (cappedCount > 5) return 'Max 5 capped retentions allowed';
    if (uncappedCount > 2) return 'Max 2 uncapped retentions allowed';

    const cost = calculateRetentionCostLakhs(chosen);
    if (cost > team.remainingPurseLakhs - this.config.minSquadSize * 30) {
      return 'Retention cost exceeds available purse';
    }

    this.applyRetentionsToTeam(team, chosen);
    const chosenSet = new Set(chosen.map((c) => c.id));
    this.playerQueue = this.playerQueue.filter((p) => !chosenSet.has(p.id));
    this.retentionReadyTeams.add(teamId);

    const allHumansReady = Object.values(this.teams)
      .filter((t) => t.ownerType === 'HUMAN')
      .every((t) => this.retentionReadyTeams.has(t.franchise.id));

    if (allHumansReady) {
      this.beginLiveBidding();
    } else {
      this.emitState();
    }
    return null;
  }

  private applyRetentionsToTeam(team: TeamState, players: Player[]): void {
    let cappedIdx = 0;
    const slabs = [1800, 1400, 1100, 1800, 1400, 400];
    for (const p of players) {
      const price = p.isUncapped
        ? 400
        : slabs[Math.min(cappedIdx++, slabs.length - 1)];
      team.remainingPurseLakhs -= price;
      team.squad.push({
        player: p,
        priceLakhs: price,
        acquiredVia: 'RETENTION',
      });
    }
    team.rtmCardsRemaining = Math.max(
      0,
      this.config.maxRetentionsAndRTM - players.length
    );
  }

  public beginLiveBidding(): void {
    if (this.phase === 'BIDDING') return;
    this.ensureShuffledOpeningPool();
    this.addSystemMessage('Live IPL Auction is underway! Hammer is up!');
    this.startTickLoop();
    this.advanceToNextLot();
  }

  private ensureShuffledOpeningPool(): void {
    const marquee = this.playerQueue.filter((p) => p.set === 'MARQUEE');
    if (marquee.length >= 8) return;

    // When AI/human retentions remove most MARQUEE players, promote top unretained
    // capped stars into the opening batch and shuffle so the same player doesn't always open.
    const needed = Math.max(0, 12 - marquee.length);
    const cappedPool = this.playerQueue
      .filter((p) => p.set !== 'MARQUEE' && p.set !== 'UNCAPPED')
      .sort((a, b) => b.ratings.overall - a.ratings.overall)
      .slice(0, needed);

    const promotedIds = new Set(cappedPool.map((p) => p.id));
    const marqueeIds = new Set(marquee.map((p) => p.id));
    const openingBatch = shuffleArray([...marquee, ...cappedPool]);
    const rest = this.playerQueue.filter(
      (p) => !marqueeIds.has(p.id) && !promotedIds.has(p.id)
    );
    this.playerQueue = [...openingBatch, ...rest];
  }

  private startTickLoop(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => {
      this.onTick();
    }, 250);
  }

  private clearTimers(): void {
    if (this.aiTimeout) {
      clearTimeout(this.aiTimeout);
      this.aiTimeout = null;
    }
    if (this.phaseTimeout) {
      clearTimeout(this.phaseTimeout);
      this.phaseTimeout = null;
    }
  }

  private onTick(): void {
    if (!this.timerEndsAt) return;
    if (
      this.phase !== 'BIDDING' &&
      this.phase !== 'RTM_COUNTER' &&
      this.phase !== 'RTM_DECISION'
    ) {
      return;
    }

    if (Date.now() >= this.timerEndsAt) {
      this.timerEndsAt = null;
      if (this.phase === 'BIDDING') {
        this.handleBiddingTimerExpired();
      } else if (this.phase === 'RTM_COUNTER') {
        this.transitionToRTMDecision();
      } else if (this.phase === 'RTM_DECISION') {
        this.resolveRTMDecision(false);
      }
    }
  }

  private advanceToNextLot(): void {
    this.clearTimers();

    if (this.playerQueue.length === 0) {
      this.completeAuction();
      return;
    }

    const nextPlayer = this.playerQueue.shift()!;
    this.currentSet = this.isAcceleratedMode ? 'ACCELERATED' : nextPlayer.set;
    this.phase = 'BIDDING';
    this.currentLot = {
      player: nextPlayer,
      currentBidLakhs: nextPlayer.basePriceLakhs,
      highestBidderTeamId: null,
      bidHistory: [],
      isAccelerated: this.isAcceleratedMode,
      rtmEligibleTeamId: null,
      rtmFinalOfferLakhs: null,
    };

    const durationSec = this.isAcceleratedMode
      ? Math.max(5, Math.floor(this.config.bidTimerSeconds * 0.7))
      : this.config.bidTimerSeconds;
    this.timerEndsAt = Date.now() + durationSec * 1000;

    this.emitState();
    this.scheduleNextAIBid();
  }

  private scheduleNextAIBid(): void {
    if (this.aiTimeout) clearTimeout(this.aiTimeout);
    if (this.phase !== 'BIDDING' || !this.currentLot) return;

    const lot = this.currentLot;
    const nextBid = getNextBidAmountLakhs(
      lot.currentBidLakhs,
      lot.highestBidderTeamId,
      lot.player.basePriceLakhs
    );

    const interestedAI = Object.values(this.teams).filter((team) =>
      shouldAIBid(team, lot.player, nextBid, lot.highestBidderTeamId, this.config)
    );

    if (interestedAI.length === 0) return;

    // Pick a random interested AI with natural reaction delay
    const chosen = interestedAI[Math.floor(Math.random() * interestedAI.length)];
    const delayMs = this.isAcceleratedMode
      ? 550 + Math.random() * 950
      : 750 + Math.random() * 1700;

    this.aiTimeout = setTimeout(() => {
      if (this.phase !== 'BIDDING' || !this.currentLot) return;
      this.placeBid(chosen.franchise.id, nextBid, true);
    }, delayMs);
  }

  public placeBid(
    teamId: string,
    requestedAmountLakhs?: number,
    isAI = false
  ): string | null {
    if (this.phase !== 'BIDDING' || !this.currentLot) {
      return 'Bidding is not active right now';
    }

    const team = this.teams[teamId];
    if (!team) return 'Unknown team';

    const minNext = getNextBidAmountLakhs(
      this.currentLot.currentBidLakhs,
      this.currentLot.highestBidderTeamId,
      this.currentLot.player.basePriceLakhs
    );

    const bidAmount = requestedAmountLakhs
      ? Math.max(minNext, requestedAmountLakhs)
      : minNext;

    const check = validateBid(
      team,
      this.currentLot.player,
      bidAmount,
      this.currentLot.highestBidderTeamId,
      this.config
    );
    if (!check.valid) return check.reason ?? 'Invalid bid';

    this.currentLot.currentBidLakhs = bidAmount;
    this.currentLot.highestBidderTeamId = teamId;
    this.currentLot.bidHistory.unshift({
      teamId,
      teamShortName: team.franchise.shortName,
      amountLakhs: bidAmount,
      timestamp: Date.now(),
      isAI,
    });

    const resetSec = this.isAcceleratedMode
      ? Math.max(4, this.config.bidResetSeconds - 2)
      : this.config.bidResetSeconds;
    this.timerEndsAt = Date.now() + resetSec * 1000;

    this.emitState();
    this.scheduleNextAIBid();
    return null;
  }

  private handleBiddingTimerExpired(): void {
    this.clearTimers();
    if (!this.currentLot) return;

    const lot = this.currentLot;
    if (!lot.highestBidderTeamId) {
      // Unsold
      this.phase = 'UNSOLD_REVEAL';
      this.unsoldPool.push(lot.player);
      this.addSystemMessage(`${lot.player.name} goes UNSOLD.`);
      this.emitState();

      this.phaseTimeout = setTimeout(() => {
        this.advanceToNextLot();
      }, 2200);
      return;
    }

    // Check RTM eligibility
    const prevId = lot.player.previousTeamId;
    const prevTeam = prevId ? this.teams[prevId] : null;
    const rtmEligible =
      this.config.enableRetentionAndRTM &&
      prevTeam &&
      prevId !== lot.highestBidderTeamId &&
      prevTeam.rtmCardsRemaining > 0 &&
      validateBid(prevTeam, lot.player, lot.currentBidLakhs, null, this.config).valid;

    if (rtmEligible && prevTeam) {
      lot.rtmEligibleTeamId = prevTeam.franchise.id;
      lot.rtmFinalOfferLakhs = lot.currentBidLakhs;
      this.phase = 'RTM_COUNTER';
      this.timerEndsAt = Date.now() + 8000;
      this.addSystemMessage(
        `${prevTeam.franchise.shortName} holds an RTM card for ${lot.player.name}! ${this.teams[lot.highestBidderTeamId].franchise.shortName} may submit one final counter-offer.`
      );
      this.emitState();

      // If highest bidder is AI, resolve counter quickly
      const winnerTeam = this.teams[lot.highestBidderTeamId];
      if (winnerTeam.ownerType === 'AI') {
        this.aiTimeout = setTimeout(() => {
          this.submitRTMCounter(winnerTeam.franchise.id, 0);
        }, 1400);
      }
      return;
    }

    this.finalizeSale(lot.highestBidderTeamId, lot.currentBidLakhs, 'AUCTION');
  }

  public submitRTMCounter(teamId: string, raiseLakhs: number): string | null {
    if (this.phase !== 'RTM_COUNTER' || !this.currentLot) return 'Not in RTM counter';
    if (this.currentLot.highestBidderTeamId !== teamId) return 'Only winning bidder can counter';

    if (raiseLakhs > 0) {
      const team = this.teams[teamId];
      const newOffer = this.currentLot.currentBidLakhs + raiseLakhs;
      const check = validateBid(team, this.currentLot.player, newOffer, null, this.config);
      if (!check.valid) return check.reason ?? 'Cannot raise offer';

      this.currentLot.currentBidLakhs = newOffer;
      this.currentLot.rtmFinalOfferLakhs = newOffer;
      this.addSystemMessage(
        `${team.franchise.shortName} raises final offer to ${formatINR(newOffer)}!`
      );
    }

    this.transitionToRTMDecision();
    return null;
  }

  private transitionToRTMDecision(): void {
    if (!this.currentLot || !this.currentLot.rtmEligibleTeamId) return;
    this.clearTimers();
    this.phase = 'RTM_DECISION';
    this.timerEndsAt = Date.now() + 9000;
    this.emitState();

    const rtmTeam = this.teams[this.currentLot.rtmEligibleTeamId];
    if (rtmTeam.ownerType === 'AI') {
      const offer = this.currentLot.rtmFinalOfferLakhs ?? this.currentLot.currentBidLakhs;
      const willUse = shouldAIUseRTM(rtmTeam, this.currentLot.player, offer, this.config);
      this.aiTimeout = setTimeout(() => {
        this.resolveRTMDecision(willUse);
      }, 1500);
    }
  }

  public resolveRTMDecision(useRtm: boolean, requesterTeamId?: string): string | null {
    if (this.phase !== 'RTM_DECISION' || !this.currentLot) return 'Not in RTM decision';
    if (
      requesterTeamId &&
      requesterTeamId !== this.currentLot.rtmEligibleTeamId
    ) {
      return 'Only the RTM-eligible franchise can decide';
    }

    const rtmTeamId = this.currentLot.rtmEligibleTeamId!;
    const rtmTeam = this.teams[rtmTeamId];
    const finalPrice = this.currentLot.rtmFinalOfferLakhs ?? this.currentLot.currentBidLakhs;

    if (
      useRtm &&
      rtmTeam.rtmCardsRemaining > 0 &&
      validateBid(rtmTeam, this.currentLot.player, finalPrice, null, this.config).valid
    ) {
      rtmTeam.rtmCardsRemaining -= 1;
      this.finalizeSale(rtmTeamId, finalPrice, 'RTM');
    } else {
      this.finalizeSale(
        this.currentLot.highestBidderTeamId!,
        finalPrice,
        'AUCTION'
      );
    }
    return null;
  }

  private finalizeSale(
    teamId: string,
    priceLakhs: number,
    via: 'AUCTION' | 'RTM'
  ): void {
    this.clearTimers();
    this.timerEndsAt = null;
    if (!this.currentLot) return;

    const team = this.teams[teamId];
    const player = this.currentLot.player;
    this.currentLot.highestBidderTeamId = teamId;
    this.currentLot.currentBidLakhs = priceLakhs;
    team.remainingPurseLakhs -= priceLakhs;
    team.squad.push({
      player,
      priceLakhs,
      acquiredVia: via,
    });
    this.soldCount++;

    this.phase = 'SOLD_REVEAL';
    this.addSystemMessage(
      `${player.name} SOLD to ${team.franchise.shortName} for ${formatINR(priceLakhs)}${
        via === 'RTM' ? ' (via RTM!)' : '!'
      }`
    );
    this.emitState();

    this.phaseTimeout = setTimeout(() => {
      this.advanceToNextLot();
    }, 2600);
  }

  public togglePause(): void {
    if (this.phase === 'PAUSED' && this.previousPhaseBeforePause) {
      this.phase = this.previousPhaseBeforePause;
      this.previousPhaseBeforePause = null;
      this.timerEndsAt = Date.now() + this.config.bidResetSeconds * 1000;
      this.emitState();
      this.scheduleNextAIBid();
    } else if (
      this.phase === 'BIDDING' ||
      this.phase === 'RTM_COUNTER' ||
      this.phase === 'RTM_DECISION'
    ) {
      this.clearTimers();
      this.previousPhaseBeforePause = this.phase;
      this.phase = 'PAUSED';
      this.timerEndsAt = null;
      this.emitState();
    }
  }

  public skipCurrentLot(requesterTeamId?: string): void {
    if (this.phase !== 'BIDDING' || !this.currentLot) return;
    this.clearTimers();

    const lot = this.currentLot;
    const player = lot.player;
    const minNext = getNextBidAmountLakhs(
      lot.currentBidLakhs,
      lot.highestBidderTeamId,
      player.basePriceLakhs
    );

    // Simulate bidding for this single player across all AI teams (excluding requester)
    const aiCandidates = Object.values(this.teams)
      .filter((team) => {
        if (team.ownerType !== 'AI') return false;
        if (requesterTeamId && team.franchise.id === requesterTeamId) return false;
        return validateBid(team, player, minNext, lot.highestBidderTeamId, this.config).valid;
      })
      .map((team) => ({
        team,
        maxVal: computeAIMaxValuationLakhs(team, player, this.config),
      }))
      .filter((c) => c.maxVal >= minNext)
      .sort((a, b) => b.maxVal - a.maxVal);

    if (aiCandidates.length > 0) {
      const top = aiCandidates[0];
      let finalPrice = minNext;

      if (aiCandidates.length > 1) {
        const secondMax = aiCandidates[1].maxVal;
        const step = getBidIncrementLakhs(secondMax);
        finalPrice = Math.min(top.maxVal, Math.max(minNext, secondMax + step));
      }

      // If another team already held a higher/equal bid, beat it by one increment if affordable
      if (lot.highestBidderTeamId && finalPrice <= lot.currentBidLakhs) {
        finalPrice = Math.min(
          top.maxVal,
          lot.currentBidLakhs + getBidIncrementLakhs(lot.currentBidLakhs)
        );
      }

      finalPrice = Math.min(
        getMaxAllowedBidLakhs(top.team, this.config),
        Math.max(minNext, Math.round(finalPrice / 5) * 5)
      );

      if (
        validateBid(top.team, player, finalPrice, lot.highestBidderTeamId, this.config).valid
      ) {
        lot.currentBidLakhs = finalPrice;
        lot.highestBidderTeamId = top.team.franchise.id;
        lot.bidHistory.unshift({
          teamId: top.team.franchise.id,
          teamShortName: top.team.franchise.shortName,
          amountLakhs: finalPrice,
          timestamp: Date.now(),
          isAI: true,
        });
      }
    }

    this.timerEndsAt = Date.now();
    this.handleBiddingTimerExpired();
  }

  public skipMultipleLots(
    mode: 'COUNT' | 'SET',
    count: number,
    requesterTeamId?: string
  ): void {
    if (this.config.mode !== 'SINGLE_PLAYER') return;
    if (this.phase !== 'BIDDING' || !this.currentLot) return;
    this.clearTimers();

    const simulateSinglePlayer = (
      player: Player,
      startBidLakhs: number,
      startHighestTeamId: string | null
    ) => {
      const minNext = getNextBidAmountLakhs(
        startBidLakhs,
        startHighestTeamId,
        player.basePriceLakhs
      );
      const aiCandidates = Object.values(this.teams)
        .filter((team) => {
          if (team.ownerType !== 'AI') return false;
          if (requesterTeamId && team.franchise.id === requesterTeamId) return false;
          return validateBid(team, player, minNext, startHighestTeamId, this.config).valid;
        })
        .map((team) => ({
          team,
          maxVal: computeAIMaxValuationLakhs(team, player, this.config),
        }))
        .filter((c) => c.maxVal >= minNext)
        .sort((a, b) => b.maxVal - a.maxVal);

      let winnerTeamId = startHighestTeamId;
      let finalPrice = startBidLakhs;

      if (aiCandidates.length > 0) {
        const top = aiCandidates[0];
        let bidPrice = minNext;
        if (aiCandidates.length > 1) {
          const secondMax = aiCandidates[1].maxVal;
          const step = getBidIncrementLakhs(secondMax);
          bidPrice = Math.min(top.maxVal, Math.max(minNext, secondMax + step));
        }
        if (startHighestTeamId && bidPrice <= startBidLakhs) {
          bidPrice = Math.min(
            top.maxVal,
            startBidLakhs + getBidIncrementLakhs(startBidLakhs)
          );
        }
        bidPrice = Math.min(
          getMaxAllowedBidLakhs(top.team, this.config),
          Math.max(minNext, Math.round(bidPrice / 5) * 5)
        );
        if (validateBid(top.team, player, bidPrice, startHighestTeamId, this.config).valid) {
          winnerTeamId = top.team.franchise.id;
          finalPrice = bidPrice;
        }
      }

      if (!winnerTeamId) {
        this.unsoldPool.push(player);
        return;
      }

      let via: 'AUCTION' | 'RTM' = 'AUCTION';
      const prevTeam = player.previousTeamId ? this.teams[player.previousTeamId] : null;
      if (
        this.config.enableRetentionAndRTM &&
        prevTeam &&
        prevTeam.ownerType === 'AI' &&
        prevTeam.franchise.id !== winnerTeamId &&
        prevTeam.rtmCardsRemaining > 0 &&
        validateBid(prevTeam, player, finalPrice, null, this.config).valid &&
        shouldAIUseRTM(prevTeam, player, finalPrice, this.config)
      ) {
        prevTeam.rtmCardsRemaining -= 1;
        winnerTeamId = prevTeam.franchise.id;
        via = 'RTM';
      }

      const winner = this.teams[winnerTeamId];
      winner.remainingPurseLakhs -= finalPrice;
      winner.squad.push({
        player,
        priceLakhs: finalPrice,
        acquiredVia: via,
      });
      this.soldCount++;
    };

    const targetSet = this.currentLot.player.set;
    let simulatedCount = 0;

    // Simulate current lot first
    simulateSinglePlayer(
      this.currentLot.player,
      this.currentLot.currentBidLakhs,
      this.currentLot.highestBidderTeamId
    );
    simulatedCount++;

    if (mode === 'COUNT') {
      while (simulatedCount < count && this.playerQueue.length > 0) {
        const nextP = this.playerQueue.shift()!;
        simulateSinglePlayer(nextP, nextP.basePriceLakhs, null);
        simulatedCount++;
      }
      this.addSystemMessage(
        `Skipped ${simulatedCount} player${simulatedCount > 1 ? 's' : ''} (simulated across AI teams).`
      );
    } else {
      while (this.playerQueue.length > 0 && this.playerQueue[0].set === targetSet) {
        const nextP = this.playerQueue.shift()!;
        simulateSinglePlayer(nextP, nextP.basePriceLakhs, null);
        simulatedCount++;
      }
      this.addSystemMessage(
        `Skipped rest of ${AUCTION_SET_LABELS[targetSet] ?? targetSet} (${simulatedCount} players simulated across AI teams).`
      );
    }

    this.currentLot = null;
    this.advanceToNextLot();
  }

  public triggerAcceleratedRound(): void {
    if (this.phase !== 'BIDDING' && this.phase !== 'PAUSED') return;
    this.isAcceleratedMode = true;
    if (this.unsoldPool.length > 0) {
      this.playerQueue.push(...shuffleArray(this.unsoldPool));
      this.unsoldPool = [];
    }
    this.addSystemMessage(
      'ACCELERATED ROUND activated! Faster timers & unsold players re-queued.'
    );
    this.emitState();
  }

  public completeAuction(): void {
    this.clearTimers();
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.timerEndsAt = null;
    this.currentLot = null;
    this.phase = 'COMPLETED';

    this.autoFillMinimumSquads();

    const grades: Record<string, TeamGrade> = {};
    for (const [teamId, team] of Object.entries(this.teams)) {
      const g = gradeTeamSquad(team);
      grades[teamId] = g;
      team.captainId = g.captainId ?? null;
      team.viceCaptainId = g.viceCaptainId ?? null;
      team.wicketkeeperId = g.wicketkeeperId ?? null;
    }
    this.grades = grades;
    this.addSystemMessage('Auction COMPLETED! Check out the squad grades & Playing XIs.');
    this.emitState();
  }

  private autoFillMinimumSquads(): void {
    const ownedIds = new Set<string>();
    for (const team of Object.values(this.teams)) {
      for (const s of team.squad) ownedIds.add(s.player.id);
    }

    const poolMap = new Map<string, Player>();
    for (const p of [...this.playerQueue, ...this.unsoldPool]) {
      if (!ownedIds.has(p.id) && !poolMap.has(p.id)) {
        poolMap.set(p.id, p);
      }
    }
    const available = Array.from(poolMap.values());
    const filledTeams = new Set<string>();

    while (available.length > 0) {
      const needy = Object.values(this.teams)
        .filter((t) => t.squad.length < this.config.minSquadSize)
        .sort((a, b) => a.squad.length - b.squad.length);
      if (needy.length === 0) break;

      let assignedAny = false;
      for (const team of needy) {
        const wkCount = team.squad.filter((s) => s.player.role === 'WK').length;
        const bowlCount = team.squad.filter(
          (s) => s.player.role === 'BOWL' || s.player.role === 'AR'
        ).length;
        const batCount = team.squad.filter(
          (s) => s.player.role === 'BAT' || s.player.role === 'WK'
        ).length;

        let bestIdx = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < available.length; i++) {
          const p = available[i];
          if (!validateBid(team, p, p.basePriceLakhs, null, this.config).valid) {
            continue;
          }
          let score = p.ratings.overall;
          if (wkCount === 0 && p.role === 'WK') score += 25;
          if (bowlCount < 5 && (p.role === 'BOWL' || p.role === 'AR')) score += 18;
          if (batCount < 5 && (p.role === 'BAT' || p.role === 'WK')) score += 15;
          // Prefer domestic players when overseas slots are tight
          if (!p.isOverseas) score += 2;
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }

        if (bestIdx !== -1) {
          const [chosen] = available.splice(bestIdx, 1);
          team.remainingPurseLakhs -= chosen.basePriceLakhs;
          team.squad.push({
            player: chosen,
            priceLakhs: chosen.basePriceLakhs,
            acquiredVia: 'AUCTION',
          });
          this.soldCount++;
          filledTeams.add(team.franchise.shortName);
          assignedAny = true;
        }
      }

      if (!assignedAny) break;
    }

    if (filledTeams.size > 0) {
      this.playerQueue = [];
      this.unsoldPool = available;
      this.addSystemMessage(
        `Auto-filled ${[...filledTeams].join(', ')} up to minimum ${this.config.minSquadSize} players from remaining pool at base price.`
      );
    }
  }

  public setLeadership(
    teamId: string,
    captainId?: string | null,
    viceCaptainId?: string | null,
    wicketkeeperId?: string | null
  ): string | null {
    if (this.phase !== 'COMPLETED') return 'Leadership can only be edited post-auction';
    const team = this.teams[teamId];
    if (!team) return 'Invalid team';

    const nextCap = captainId !== undefined ? captainId : team.captainId ?? null;
    const nextVc = viceCaptainId !== undefined ? viceCaptainId : team.viceCaptainId ?? null;
    const nextWk =
      wicketkeeperId !== undefined ? wicketkeeperId : team.wicketkeeperId ?? null;
    if (nextCap && !team.squad.some((s) => s.player.id === nextCap)) {
      return 'Captain must be in squad';
    }
    if (nextVc && !team.squad.some((s) => s.player.id === nextVc)) {
      return 'Vice-Captain must be in squad';
    }
    if (nextWk && !team.squad.some((s) => s.player.id === nextWk)) {
      return 'Wicketkeeper must be in squad';
    }
    if (nextCap && nextVc && nextCap === nextVc) {
      return 'Captain and Vice-Captain must be different players';
    }

    team.captainId = nextCap;
    team.viceCaptainId = nextVc;
    team.wicketkeeperId = nextWk;
    if (this.grades) {
      this.grades[teamId] = gradeTeamSquad(team);
    }
    this.emitState();
    return null;
  }

  public simulateSeason(): void {
    if (this.phase !== 'COMPLETED' || !this.grades) return;
    this.seasonResult = simulateIPLSeason(this.teams, this.grades);
    const champ = this.teams[this.seasonResult.championTeamId];
    this.addSystemMessage(
      `IPL Season Simulated! ${champ.franchise.name} won the championship!`
    );
    this.emitState();
  }

  public simulateRemainingAuction(): void {
    if (this.phase === 'LOBBY' || this.phase === 'COMPLETED') return;
    this.clearTimers();

    if (this.phase === 'RETENTION') {
      this.buildInitialQueue();
      this.autoSelectAIRetentions();
    }

    // Re-queue active lot if interrupted mid-bidding
    if (this.currentLot) {
      this.playerQueue.unshift(this.currentLot.player);
      this.currentLot = null;
    }

    const resolvePool = (pool: Player[]) => {
      const remainingUnsold: Player[] = [];
      for (const player of pool) {
        const candidates = Object.values(this.teams)
          .map((team) => {
            const check = validateBid(
              team,
              player,
              player.basePriceLakhs,
              null,
              this.config
            );
            if (!check.valid) return null;
            const maxVal = computeAIMaxValuationLakhs(team, player, this.config);
            if (maxVal < player.basePriceLakhs) return null;
            return { team, maxVal };
          })
          .filter(
            (c): c is { team: TeamState; maxVal: number } => c !== null
          )
          .sort((a, b) => b.maxVal - a.maxVal);

        if (candidates.length === 0) {
          remainingUnsold.push(player);
          continue;
        }

        const top = candidates[0];
        let finalPrice = player.basePriceLakhs;
        if (candidates.length > 1) {
          const secondMax = candidates[1].maxVal;
          const step = getBidIncrementLakhs(secondMax);
          finalPrice = Math.min(top.maxVal, secondMax + step);
        }
        finalPrice = Math.min(
          getMaxAllowedBidLakhs(top.team, this.config),
          Math.max(player.basePriceLakhs, Math.round(finalPrice / 5) * 5)
        );

        let winnerTeam = top.team;
        let via: 'AUCTION' | 'RTM' = 'AUCTION';

        // Check RTM
        const prevId = player.previousTeamId;
        const prevTeam = prevId ? this.teams[prevId] : null;
        if (
          this.config.enableRetentionAndRTM &&
          prevTeam &&
          prevId !== winnerTeam.franchise.id &&
          prevTeam.rtmCardsRemaining > 0 &&
          validateBid(prevTeam, player, finalPrice, null, this.config).valid
        ) {
          const prevVal = computeAIMaxValuationLakhs(
            prevTeam,
            player,
            this.config
          );
          if (finalPrice <= Math.round(prevVal * 1.08)) {
            prevTeam.rtmCardsRemaining -= 1;
            winnerTeam = prevTeam;
            via = 'RTM';
          }
        }

        winnerTeam.remainingPurseLakhs -= finalPrice;
        winnerTeam.squad.push({
          player,
          priceLakhs: finalPrice,
          acquiredVia: via,
        });
        this.soldCount++;
      }
      return remainingUnsold;
    };

    const firstUnsold = resolvePool(this.playerQueue);
    this.playerQueue = [];

    // Accelerated pass over unsold pool
    const stillUnsold = resolvePool([...this.unsoldPool, ...firstUnsold]);
    this.unsoldPool = stillUnsold;

    // Ensure every team reaches at least minSquadSize using affordable unsold players
    for (const team of Object.values(this.teams)) {
      while (team.squad.length < this.config.minSquadSize && this.unsoldPool.length > 0) {
        const idx = this.unsoldPool.findIndex((p) =>
          validateBid(team, p, p.basePriceLakhs, null, this.config).valid
        );
        if (idx === -1) break;
        const [picked] = this.unsoldPool.splice(idx, 1);
        team.remainingPurseLakhs -= picked.basePriceLakhs;
        team.squad.push({
          player: picked,
          priceLakhs: picked.basePriceLakhs,
          acquiredVia: 'AUCTION',
        });
        this.soldCount++;
      }
    }

    this.addSystemMessage(
      'Remaining auction lots simulated! All squads finalized.'
    );
    this.completeAuction();
  }

  public addChatMessage(
    senderName: string,
    teamShortName: string | null,
    text: string
  ): void {
    const trimmed = text.trim().slice(0, 220);
    if (!trimmed) return;
    this.chatMessages.push({
      id: uuidv4(),
      senderName,
      teamShortName,
      text: trimmed,
      timestamp: Date.now(),
    });
    this.emitState();
  }

  public triggerReaction(emoji: string, senderName: string): void {
    this.lastActivityAt = Date.now();
    this.callbacks.onReaction(this.roomCode, {
      id: uuidv4(),
      emoji,
      senderName,
      timestamp: Date.now(),
    });
  }

  public destroy(): void {
    this.clearTimers();
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}
