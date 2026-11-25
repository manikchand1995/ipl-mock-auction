export type PlayerRole = 'BAT' | 'BOWL' | 'AR' | 'WK';

export type PlayingRole =
  | 'OPENER'
  | 'TOP_ORDER'
  | 'MIDDLE_ORDER'
  | 'FINISHER'
  | 'PACE_AR'
  | 'SPIN_AR'
  | 'PACE_BOWL'
  | 'SPIN_BOWL';

export type AuctionSet =
  | 'MARQUEE'
  | 'BAT'
  | 'AR'
  | 'WK'
  | 'FAST_BOWL'
  | 'SPIN_BOWL'
  | 'UNCAPPED';

export type AIPersonality =
  | 'aggressive'
  | 'balanced'
  | 'value_hunter'
  | 'star_chaser';

export interface FormatStats {
  matches: number;
  runs?: number;
  average?: number;
  strikeRate?: number;
  wickets?: number;
  economy?: number;
}

export interface Player {
  id: string;
  name: string;
  country: string;
  isOverseas: boolean;
  isUncapped: boolean;
  role: PlayerRole;
  playingRole?: PlayingRole;
  battingStyle: string;
  bowlingStyle: string;
  basePriceLakhs: number; // e.g., 200 = ₹2 Cr, 30 = ₹30L
  set: AuctionSet;
  previousTeamId: string | null; // For RTM eligibility
  stats: {
    matches: number;
    runs?: number;
    strikeRate?: number;
    wickets?: number;
    economy?: number;
    listA?: FormatStats;
    fc?: FormatStats;
  };
  ratings: {
    overall: number; // 1-100
    batting: number; // 1-100
    bowling: number; // 1-100
    fielding: number; // 1-100
  };
}

export interface AcquiredPlayer {
  player: Player;
  priceLakhs: number;
  acquiredVia: 'AUCTION' | 'RETENTION' | 'RTM';
}

export type PitchType =
  | 'SPIN_FRIENDLY'
  | 'PACE_BOUNCE'
  | 'BATTING_PARADISE'
  | 'BALANCED';

export interface HomeGroundSpec {
  stadium: string;
  city: string;
  pitchType: PitchType;
  pitchLabel: string;
  parScore: number;
  summary: string;
}

export interface Franchise {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  homeGround: HomeGroundSpec;
}

export interface TeamState {
  franchise: Franchise;
  ownerType: 'HUMAN' | 'AI';
  ownerName: string;
  playerToken: string | null;
  isConnected: boolean;
  aiPersonality: AIPersonality;
  remainingPurseLakhs: number;
  rtmCardsRemaining: number;
  squad: AcquiredPlayer[];
}

export interface RoomConfig {
  mode: 'SINGLE_PLAYER' | 'MULTIPLAYER';
  totalPurseLakhs: number; // Default 12000 (₹120 Cr)
  minSquadSize: number; // Default 18
  maxSquadSize: number; // Default 25
  maxOverseas: number; // Default 8
  bidTimerSeconds: number; // Default 10
  bidResetSeconds: number; // Default 6
  enableRetentionAndRTM: boolean; // Default true
  maxRetentionsAndRTM: number; // Default 6
  aiDifficulty: 'CASUAL' | 'COMPETITIVE' | 'SHARK';
}

export type AuctionPhase =
  | 'LOBBY'
  | 'RETENTION'
  | 'BIDDING'
  | 'RTM_COUNTER' // Winning bidder gets 1 final raise before RTM team matches
  | 'RTM_DECISION' // Previous team decides whether to match
  | 'SOLD_REVEAL'
  | 'UNSOLD_REVEAL'
  | 'PAUSED'
  | 'COMPLETED';

export interface BidEntry {
  teamId: string;
  teamShortName: string;
  amountLakhs: number;
  timestamp: number;
  isAI: boolean;
}

export interface CurrentLot {
  player: Player;
  currentBidLakhs: number;
  highestBidderTeamId: string | null;
  bidHistory: BidEntry[];
  isAccelerated: boolean;
  rtmEligibleTeamId: string | null;
  rtmFinalOfferLakhs: number | null;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  teamShortName: string | null;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  timestamp: number;
}

export interface TeamGrade {
  teamId: string;
  overallScore: number; // 0-100
  grade: 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C';
  battingScore: number;
  bowlingScore: number;
  balanceScore: number;
  homeAdvantageScore: number;
  playingXI: AcquiredPlayer[];
  impactPlayer: AcquiredPlayer | null;
  strengths: string[];
  weaknesses: string[];
  bestValueBuy: AcquiredPlayer | null;
  mostExpensiveBuy: AcquiredPlayer | null;
}

export interface BatterInnings {
  playerId: string;
  name: string;
  role: PlayerRole;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  outText: string;
}

export interface BowlerFigures {
  playerId: string;
  name: string;
  overs: string;
  runs: number;
  wickets: number;
  economy: number;
}

export interface ImpactSubInfo {
  inPlayerId: string;
  inPlayerName: string;
  outPlayerId: string;
  outPlayerName: string;
}

export interface InningsScorecard {
  battingTeamId: string;
  bowlingTeamId: string;
  totalRuns: number;
  wickets: number;
  overs: string;
  extras: number;
  batters: BatterInnings[];
  yetToBat?: { playerId: string; name: string; role: PlayerRole }[];
  bowlers: BowlerFigures[];
  battingImpactSub?: ImpactSubInfo;
  bowlingImpactSub?: ImpactSubInfo;
}

export interface SimulatedMatchResult {
  id: string;
  matchNumber: number;
  dateLabel: string;
  stage: 'LEAGUE' | 'QUALIFIER_1' | 'ELIMINATOR' | 'QUALIFIER_2' | 'FINAL';
  homeTeamId: string;
  awayTeamId: string;
  stadium: string;
  homeScore: string;
  awayScore: string;
  winnerTeamId: string;
  tossSummary?: string;
  summary: string;
  topPerformer: string;
  innings1: InningsScorecard;
  innings2: InningsScorecard;
}

export interface StandingsRow {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  nrr: number;
}

export interface PlayerSeasonStats {
  playerId: string;
  name: string;
  teamId: string;
  role: PlayerRole;
  matches: number;
  runs: number;
  balls: number;
  strikeRate: number;
  highScore: number;
  fifties: number;
  hundreds: number;
  fours: number;
  sixes: number;
  wickets: number;
  runsConceded: number;
  oversBowled: number;
  economy: number;
  bestBowling: string;
}

export interface TeamSeasonStats {
  teamId: string;
  matches: number;
  won: number;
  lost: number;
  totalRunsFor: number;
  totalWicketsTaken: number;
  highestTotal: number;
  lowestTotal: number;
  avgScore: number;
  homeWins: number;
  awayWins: number;
}

export interface SeasonSimulationResult {
  standings: StandingsRow[];
  matches: SimulatedMatchResult[];
  playoffs: SimulatedMatchResult[];
  playerStats: PlayerSeasonStats[];
  teamStats: TeamSeasonStats[];
  championTeamId: string;
  runnerUpTeamId: string;
  mvpText: string;
}

export interface PublicRoomState {
  roomCode: string;
  hostToken: string; // Client compares against its own playerToken
  config: RoomConfig;
  phase: AuctionPhase;
  previousPhaseBeforePause: AuctionPhase | null;
  teams: Record<string, TeamState>;
  currentLot: CurrentLot | null;
  timerEndsAt: number | null;
  timerRemainingMs: number;
  currentSet: AuctionSet | 'ACCELERATED' | null;
  remainingQueueCount: number;
  unsoldCount: number;
  soldCount: number;
  upcomingPlayerIds: string[];
  unsoldPlayerIds: string[];
  retentionReadyTeams: string[];
  chatMessages: ChatMessage[];
  grades: Record<string, TeamGrade> | null;
  seasonResult: SeasonSimulationResult | null;
}

export interface JoinSessionResponse {
  ok: boolean;
  error?: string;
  roomCode?: string;
  playerToken?: string;
  assignedTeamId?: string | null;
  state?: PublicRoomState;
}
