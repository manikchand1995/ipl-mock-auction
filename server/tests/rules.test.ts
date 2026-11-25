import assert from 'node:assert/strict';
import test from 'node:test';
import playersData from '../../shared/data/players.json';
import { DEFAULT_ROOM_CONFIG, IPL_FRANCHISES } from '../../shared/constants';
import {
  calculateRetentionCostLakhs,
  formatINR,
  getBidIncrementLakhs,
  getNextBidAmountLakhs,
  validateBid,
} from '../../shared/rules';
import { Player, TeamGrade, TeamState } from '../../shared/types';
import { computeAIMaxValuationLakhs } from '../AIBiddingAgent';
import { AuctionEngine } from '../AuctionEngine';
import { simulateIPLSeason } from '../SeasonSimulator';
import { gradeTeamSquad } from '../SquadGrader';

const samplePlayer: Player = {
  id: 't1',
  name: 'Test Star',
  country: 'Australia',
  isOverseas: true,
  isUncapped: false,
  role: 'BAT',
  battingStyle: 'Right-hand bat',
  bowlingStyle: 'N/A',
  basePriceLakhs: 200,
  set: 'MARQUEE',
  previousTeamId: 'mi',
  stats: { matches: 50, runs: 1500, strikeRate: 145 },
  ratings: { overall: 90, batting: 92, bowling: 15, fielding: 85 },
};

function makeTeam(overrides?: Partial<TeamState>): TeamState {
  return {
    franchise: IPL_FRANCHISES[0],
    ownerType: 'HUMAN',
    ownerName: 'Tester',
    playerToken: 'tok-1',
    isConnected: true,
    aiPersonality: 'balanced',
    remainingPurseLakhs: 12000,
    rtmCardsRemaining: 6,
    squad: [],
    ...overrides,
  };
}

test('formatINR formats Lakhs and Crores cleanly', () => {
  assert.equal(formatINR(30), '₹30 L');
  assert.equal(formatINR(100), '₹1 Cr');
  assert.equal(formatINR(1250), '₹12.5 Cr');
});

test('bid increments follow IPL slabs', () => {
  assert.equal(getBidIncrementLakhs(50), 5);
  assert.equal(getBidIncrementLakhs(150), 10);
  assert.equal(getBidIncrementLakhs(300), 20);
  assert.equal(getBidIncrementLakhs(600), 25);
  assert.equal(getNextBidAmountLakhs(200, null, 200), 200);
  assert.equal(getNextBidAmountLakhs(200, 'csk', 200), 220);
});

test('validateBid enforces duplicate bidder, overseas cap, and purse reserve', () => {
  const team = makeTeam();
  assert.equal(validateBid(team, samplePlayer, 200, 'csk', DEFAULT_ROOM_CONFIG).valid, false);
  assert.equal(validateBid(team, samplePlayer, 200, 'mi', DEFAULT_ROOM_CONFIG).valid, true);

  // Purse reserve guard: with 0 players and minSquad=18, must reserve 17 * 30 = 510L
  const lowPurseTeam = makeTeam({ remainingPurseLakhs: 600 });
  assert.equal(validateBid(lowPurseTeam, samplePlayer, 100, null, DEFAULT_ROOM_CONFIG).valid, false);
  assert.equal(validateBid(lowPurseTeam, samplePlayer, 90, null, DEFAULT_ROOM_CONFIG).valid, true);
});

test('calculateRetentionCostLakhs applies capped and uncapped slabs', () => {
  const uncapped = { ...samplePlayer, isUncapped: true };
  assert.equal(calculateRetentionCostLakhs([samplePlayer, samplePlayer, uncapped]), 1800 + 1400 + 400);
});

test('players pool is large enough for 10 full 25-player squads', () => {
  const pool = playersData as Player[];
  const ids = new Set(pool.map((p) => p.id));
  assert.equal(ids.size, pool.length, 'Player IDs must be unique');
  assert.ok(pool.length >= 260, `Expected >= 260 players, got ${pool.length}`);
  const domesticCount = pool.filter((p) => !p.isOverseas).length;
  assert.ok(domesticCount >= 170, `Expected >= 170 domestic players, got ${domesticCount}`);
  const missingCareer = pool.filter((p) => !p.stats.listA || !p.stats.fc);
  assert.equal(missingCareer.length, 0, 'Every player must have List A and FC stats');
});

test('gradeTeamSquad selects balanced XI with bowlers and sorts by batting order', () => {
  const pool = playersData as Player[];
  const bats = pool.filter((p) => p.role === 'BAT' && !p.isOverseas).slice(0, 8);
  const wk = pool.find((p) => p.role === 'WK' && !p.isOverseas)!;
  const ars = pool.filter((p) => p.role === 'AR' && !p.isOverseas).slice(0, 3);
  const bowls = pool.filter((p) => p.role === 'BOWL' && !p.isOverseas).slice(0, 6);

  const squad = [...bats, wk, ...ars, ...bowls].map((p) => ({
    player: p,
    priceLakhs: 100,
    acquiredVia: 'AUCTION' as const,
  }));

  const team = makeTeam({ squad });
  const grade = gradeTeamSquad(team);

  assert.equal(grade.playingXI.length, 11);
  const bowlersInXI = grade.playingXI.filter(
    (x) => x.player.role === 'BOWL' || x.player.role === 'AR'
  );
  assert.ok(bowlersInXI.length >= 5, `Expected >= 5 bowlers/ARs in XI, got ${bowlersInXI.length}`);

  // Verify batting order: BAT/WK (0) <= AR (1) <= BOWL (2)
  const orderMap: Record<string, number> = { BAT: 0, WK: 0, AR: 1, BOWL: 2 };
  for (let i = 1; i < grade.playingXI.length; i++) {
    const prev = orderMap[grade.playingXI[i - 1].player.role];
    const curr = orderMap[grade.playingXI[i].player.role];
    assert.ok(prev <= curr, 'Playing XI must be sorted BAT/WK -> AR -> BOWL');
  }
});

test('simulateIPLSeason generates timetable, scorecards, and player/team stats', () => {
  const pool = playersData as Player[];
  const teams: Record<string, TeamState> = {};
  const grades: Record<string, TeamGrade> = {};

  IPL_FRANCHISES.forEach((f, idx) => {
    const slice = pool.slice(idx * 18, idx * 18 + 18).map((p) => ({
      player: p,
      priceLakhs: 100,
      acquiredVia: 'AUCTION' as const,
    }));
    teams[f.id] = makeTeam({ franchise: f, squad: slice });
    grades[f.id] = gradeTeamSquad(teams[f.id]);
  });

  const season = simulateIPLSeason(teams, grades);
  assert.equal(season.matches.length, 94); // 90 league + 4 playoffs
  assert.equal(season.playoffs.length, 4);
  assert.equal(season.standings.length, 10);
  assert.equal(season.teamStats.length, 10);
  assert.ok(season.playerStats.length > 0);
  assert.ok(season.matches[0].innings1.batters.length > 0);
  assert.ok(season.matches[0].innings1.bowlers.length > 0);
  assert.equal(
    season.matches[0].innings1.batters.length +
      (season.matches[0].innings1.yetToBat?.length ?? 0),
    11
  );
  assert.ok(season.matches[0].innings1.battingImpactSub);
  assert.ok(season.matches[0].innings2.bowlingImpactSub);
  assert.ok(season.matches[0].tossSummary?.includes('won the toss'));
});

test('playingRole places openers before top-order batters like Suryakumar Yadav', () => {
  const pool = playersData as Player[];
  const rohit = pool.find((p) => p.name === 'Rohit Sharma')!;
  const gill = pool.find((p) => p.name === 'Shubman Gill')!;
  const sky = pool.find((p) => p.name === 'Suryakumar Yadav')!;
  const pant = pool.find((p) => p.name === 'Rishabh Pant')!;
  const rinku = pool.find((p) => p.name === 'Rinku Singh')!;
  const jadeja = pool.find((p) => p.name === 'Ravindra Jadeja')!;
  const axar = pool.find((p) => p.name === 'Axar Patel')!;
  const bowls = pool.filter((p) => p.role === 'BOWL' && !p.isOverseas).slice(0, 4);

  const squad = [sky, rohit, gill, pant, rinku, jadeja, axar, ...bowls].map((p) => ({
    player: p,
    priceLakhs: 100,
    acquiredVia: 'AUCTION' as const,
  }));

  const grade = gradeTeamSquad(makeTeam({ squad }));
  assert.equal(grade.playingXI[0].player.playingRole, 'OPENER');
  assert.equal(grade.playingXI[1].player.playingRole, 'OPENER');
  assert.equal(grade.playingXI[2].player.name, 'Suryakumar Yadav');
});

test('SPIN_FRIENDLY AI tapers spinner valuation after 5 spinners and values pacers', () => {
  const pool = playersData as Player[];
  const spinners = pool.filter((p) => p.playingRole === 'SPIN_BOWL' && !p.isOverseas);
  const pacer = pool.find((p) => p.playingRole === 'PACE_BOWL' && !p.isOverseas)!;
  const targetSpinner = spinners[5];

  const cskNoSpinners = makeTeam({ franchise: IPL_FRANCHISES[0], squad: [] });
  const cskFiveSpinners = makeTeam({
    franchise: IPL_FRANCHISES[0],
    squad: spinners.slice(0, 5).map((p) => ({
      player: p,
      priceLakhs: 100,
      acquiredVia: 'AUCTION' as const,
    })),
  });

  const valEarly = computeAIMaxValuationLakhs(cskNoSpinners, targetSpinner, DEFAULT_ROOM_CONFIG);
  const valFull = computeAIMaxValuationLakhs(cskFiveSpinners, targetSpinner, DEFAULT_ROOM_CONFIG);
  const pacerVal = computeAIMaxValuationLakhs(cskFiveSpinners, pacer, DEFAULT_ROOM_CONFIG);

  assert.ok(valFull < valEarly, 'Spinner valuation should drop sharply once 5 spinners are in squad');
  assert.ok(pacerVal > valFull, 'Team with 0 pacers should value a pacer higher than a 6th spinner');
});

test('gradeTeamSquad includes at least 2 pacers and 2 spinners in XI when available', () => {
  const pool = playersData as Player[];
  const bats = pool.filter((p) => p.role === 'BAT' && !p.isOverseas).slice(0, 6);
  const wk = pool.find((p) => p.role === 'WK' && !p.isOverseas)!;
  const pacers = pool.filter((p) => p.playingRole === 'PACE_BOWL' && !p.isOverseas).slice(0, 5);
  const spinners = pool.filter((p) => p.playingRole === 'SPIN_BOWL' && !p.isOverseas).slice(0, 4);

  const squad = [...bats, wk, ...pacers, ...spinners].map((p) => ({
    player: p,
    priceLakhs: 100,
    acquiredVia: 'AUCTION' as const,
  }));

  const grade = gradeTeamSquad(makeTeam({ franchise: IPL_FRANCHISES[1], squad }));
  const xiPacers = grade.playingXI.filter(
    (x) => x.player.playingRole === 'PACE_BOWL' || x.player.playingRole === 'PACE_AR'
  );
  const xiSpinners = grade.playingXI.filter(
    (x) => x.player.playingRole === 'SPIN_BOWL' || x.player.playingRole === 'SPIN_AR'
  );
  assert.ok(xiPacers.length >= 2, `Expected >= 2 pacers in XI, got ${xiPacers.length}`);
  assert.ok(xiSpinners.length >= 2, `Expected >= 2 spinners in XI, got ${xiSpinners.length}`);
});

test('skipCurrentLot simulates bidding across other AI teams instead of freezing at base price', () => {
  const pool = playersData as Player[];
  const kohli = pool.find((p) => p.name === 'Virat Kohli')!;
  const engine = new AuctionEngine(
    'TEST01',
    'host-tok',
    { ...DEFAULT_ROOM_CONFIG, enableRetentionAndRTM: false },
    { onStateChange: () => {}, onReaction: () => {} }
  );
  engine.assignHumanToTeam('csk', 'host-tok', 'Host');
  engine.phase = 'BIDDING';
  engine.currentLot = {
    player: kohli,
    currentBidLakhs: kohli.basePriceLakhs,
    highestBidderTeamId: null,
    bidHistory: [],
    isAccelerated: false,
    rtmEligibleTeamId: null,
    rtmFinalOfferLakhs: null,
  };

  engine.skipCurrentLot('csk');
  const state = engine.getPublicState();
  engine.destroy();

  assert.equal(state.phase, 'SOLD_REVEAL');
  assert.ok(state.currentLot?.highestBidderTeamId !== null);
  assert.notEqual(state.currentLot?.highestBidderTeamId, 'csk');
  assert.ok(
    (state.currentLot?.currentBidLakhs ?? 0) > kohli.basePriceLakhs,
    `Expected Kohli bid > ${kohli.basePriceLakhs}L, got ${state.currentLot?.currentBidLakhs}L`
  );
});

test('releaseHumanTeam converts exited human team to AI bot and unblocks retention phase', () => {
  const engine = new AuctionEngine(
    'EXIT01',
    'host-tok',
    { ...DEFAULT_ROOM_CONFIG, enableRetentionAndRTM: true },
    { onStateChange: () => {}, onReaction: () => {} }
  );
  engine.assignHumanToTeam('csk', 'host-tok', 'Host');
  engine.assignHumanToTeam('mi', 'guest-tok', 'Guest');
  engine.startAuction();

  assert.equal(engine.phase, 'RETENTION');
  // Host locks retentions; room is waiting on Guest (MI)
  const err = engine.submitHumanRetention('csk', []);
  assert.equal(err, null);
  assert.equal(engine.phase, 'RETENTION');

  // Guest exits -> MI is taken over by AI bot and live bidding begins automatically
  const released = engine.releaseHumanTeam('guest-tok');
  const state = engine.getPublicState();
  engine.destroy();

  assert.ok(released);
  assert.equal(state.teams['mi'].ownerType, 'AI');
  assert.equal(state.teams['mi'].playerToken, null);
  assert.equal(state.phase, 'BIDDING');
});

test('auction opening lot is shuffled across unretained stars rather than always Mitchell Starc', () => {
  const firstPlayers = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const engine = new AuctionEngine(
      `SHUF${i}`,
      'host-tok',
      { ...DEFAULT_ROOM_CONFIG, enableRetentionAndRTM: true },
      { onStateChange: () => {}, onReaction: () => {} }
    );
    engine.assignHumanToTeam('csk', 'host-tok', 'Host');
    engine.startAuction();
    engine.submitHumanRetention('csk', []);
    const first = engine.getPublicState().currentLot?.player.name;
    if (first) firstPlayers.add(first);
    engine.destroy();
  }
  assert.ok(
    firstPlayers.size >= 3,
    `Expected varied first lots across 12 runs, got only: ${[...firstPlayers].join(', ')}`
  );
});
