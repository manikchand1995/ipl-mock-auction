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
import { RoomManager } from '../RoomManager';
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
  set: 'M1',
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

  const indianPool = pool.filter((p) => !p.isOverseas);
  const overseasPool = pool.filter((p) => p.isOverseas);

  IPL_FRANCHISES.forEach((f, idx) => {
    const slice = [
      ...indianPool.slice(idx * 12, idx * 12 + 12),
      ...overseasPool.slice(idx * 6, idx * 6 + 6),
    ].map((p) => ({
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
  assert.ok(season.playerStats.some((ps) => (ps.mvpPoints ?? 0) > 0));
  assert.ok(season.matches[0].innings1.batters.length > 0);
  assert.ok(season.matches[0].innings1.bowlers.length > 0);
  assert.equal(
    season.matches[0].innings1.batters.length +
      (season.matches[0].innings1.yetToBat?.length ?? 0),
    11
  );
  assert.ok(season.matches.some((m) => m.innings1.battingImpactSub));
  assert.ok(season.matches.some((m) => m.innings2.bowlingImpactSub));
  assert.ok(season.matches[0].tossSummary?.includes('won the toss'));
  assert.ok(
    season.matches.every((m) => {
      const batSub = m.innings2.battingImpactSub;
      const bowlSub = m.innings2.bowlingImpactSub;
      const batOk = !batSub || m.innings2.batters.some((b) => b.playerId === batSub.inPlayerId);
      const bowlOk = !bowlSub || m.innings2.bowlers.some((bw) => bw.playerId === bowlSub.inPlayerId);
      return batOk && bowlOk;
    }),
    'Every Impact Sub shown on a scorecard must have actually batted or bowled'
  );
  assert.ok(
    season.matches.every((m) => {
      const checkTeamMax4Overseas = (teamId: string, inn1: typeof m.innings1, inn2: typeof m.innings2) => {
        const squad = teams[teamId].squad;
        const usedIds = new Set<string>();
        const collectBat = (inn: typeof m.innings1) => {
          if (inn.battingTeamId !== teamId) return;
          inn.batters.forEach((b) => usedIds.add(b.playerId));
          inn.yetToBat?.forEach((y) => usedIds.add(y.playerId));
        };
        const collectBowl = (inn: typeof m.innings1) => {
          if (inn.bowlingTeamId !== teamId) return;
          inn.bowlers.forEach((bw) => usedIds.add(bw.playerId));
        };
        collectBat(inn1);
        collectBat(inn2);
        collectBowl(inn1);
        collectBowl(inn2);
        const osCount = [...usedIds].filter(
          (id) => squad.find((s) => s.player.id === id)?.player.isOverseas
        ).length;
        return osCount <= 4;
      };
      return (
        checkTeamMax4Overseas(m.homeTeamId, m.innings1, m.innings2) &&
        checkTeamMax4Overseas(m.awayTeamId, m.innings1, m.innings2)
      );
    }),
    'Total distinct overseas players used per team per match (XI + Impact Sub) must not exceed 4'
  );
  assert.ok(
    season.matches.some((m) => m.innings1.bowlers.length === 6 || m.innings2.bowlers.length === 6),
    'Expected at least some innings to use 6 bowlers including all-rounders'
  );
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

test('resolveRTMDecision updates currentLot.highestBidderTeamId to the RTM team', () => {
  const pool = playersData as Player[];
  const kohli = pool.find((p) => p.id === 'p001')!; // previousTeamId: 'rcb'
  const engine = new AuctionEngine(
    'RTM001',
    'host-tok',
    { ...DEFAULT_ROOM_CONFIG, enableRetentionAndRTM: true },
    { onStateChange: () => {}, onReaction: () => {} }
  );
  engine.assignHumanToTeam('rcb', 'host-tok', 'Host');
  engine.phase = 'RTM_DECISION';
  engine.currentLot = {
    player: kohli,
    currentBidLakhs: 1400,
    highestBidderTeamId: 'mi',
    bidHistory: [],
    isAccelerated: false,
    rtmEligibleTeamId: 'rcb',
    rtmFinalOfferLakhs: 1400,
  };

  const err = engine.resolveRTMDecision(true, 'rcb');
  const state = engine.getPublicState();
  engine.destroy();

  assert.equal(err, null);
  assert.equal(state.phase, 'SOLD_REVEAL');
  assert.equal(state.currentLot?.highestBidderTeamId, 'rcb');
  assert.equal(state.currentLot?.currentBidLakhs, 1400);
  assert.equal(state.teams['rcb'].squad[0]?.acquiredVia, 'RTM');
});

test('RoomManager.joinRoom rejects SINGLE_PLAYER rooms and allows MULTIPLAYER rooms', () => {
  const rm = new RoomManager({ onStateChange: () => {}, onReaction: () => {} });
  const sp = rm.createRoom('Solo', { mode: 'SINGLE_PLAYER' }, 'sock-1');
  const spJoin = rm.joinRoom(sp.engine.roomCode, 'Intruder', 'sock-2');
  assert.equal(spJoin.ok, false);

  const mp = rm.createRoom('Host', { mode: 'MULTIPLAYER' }, 'sock-3');
  const mpJoin = rm.joinRoom(mp.engine.roomCode, 'Friend', 'sock-4');
  assert.equal(mpJoin.ok, true);

  sp.engine.destroy();
  mp.engine.destroy();
});

test('gradeTeamSquad assigns distinct Captain and Vice-Captain and setLeadership updates them', () => {
  const pool = playersData as Player[];
  const indianPool = pool.filter((p) => !p.isOverseas);
  const squad = indianPool.slice(0, 15).map((p) => ({
    player: p,
    priceLakhs: 100,
    acquiredVia: 'AUCTION' as const,
  }));
  const engine = new AuctionEngine(
    'LEAD01',
    'host-tok',
    DEFAULT_ROOM_CONFIG,
    { onStateChange: () => {}, onReaction: () => {} }
  );
  engine.assignHumanToTeam('csk', 'host-tok', 'Host');
  engine.teams['csk'].squad = squad;
  engine.completeAuction();

  const initialGrade = engine.grades?.['csk'];
  assert.ok(initialGrade?.captainId);
  assert.ok(initialGrade?.viceCaptainId);
  assert.ok(initialGrade?.wicketkeeperId);
  assert.notEqual(initialGrade?.captainId, initialGrade?.viceCaptainId);

  const customCap = squad[4].player.id;
  const customVc = squad[5].player.id;
  const customWk = squad[6].player.id;
  const err = engine.setLeadership('csk', customCap, customVc, customWk);
  assert.equal(err, null);
  assert.equal(engine.teams['csk'].captainId, customCap);
  assert.equal(engine.teams['csk'].viceCaptainId, customVc);
  assert.equal(engine.teams['csk'].wicketkeeperId, customWk);
  engine.destroy();
});

test('skipMultipleLots works in SINGLE_PLAYER mode and is ignored in MULTIPLAYER mode', () => {
  const sp = new AuctionEngine(
    'SKIP01',
    'host-tok',
    { ...DEFAULT_ROOM_CONFIG, mode: 'SINGLE_PLAYER', enableRetentionAndRTM: false },
    { onStateChange: () => {}, onReaction: () => {} }
  );
  const mp = new AuctionEngine(
    'SKIP02',
    'host-tok',
    { ...DEFAULT_ROOM_CONFIG, mode: 'MULTIPLAYER', enableRetentionAndRTM: false },
    { onStateChange: () => {}, onReaction: () => {} }
  );
  try {
    sp.assignHumanToTeam('csk', 'host-tok', 'Host');
    sp.startAuction();
    const initialQueueLen = sp.getPublicState().remainingQueueCount;
    sp.skipMultipleLots('COUNT', 5, 'csk');
    const afterSkip5 = sp.getPublicState();
    assert.equal(afterSkip5.phase, 'BIDDING');
    assert.equal(afterSkip5.remainingQueueCount, initialQueueLen - 5);
    assert.equal(afterSkip5.teams['csk'].squad.length, 0);

    const setBefore = afterSkip5.currentLot?.player.set;
    sp.skipMultipleLots('SET', 0, 'csk');
    const afterSkipSet = sp.getPublicState();
    assert.notEqual(afterSkipSet.currentLot?.player.set, setBefore);

    mp.assignHumanToTeam('csk', 'host-tok', 'Host');
    mp.startAuction();
    const mpLen = mp.getPublicState().remainingQueueCount;
    mp.skipMultipleLots('COUNT', 5, 'csk');
    assert.equal(mp.getPublicState().remainingQueueCount, mpLen);
  } finally {
    sp.destroy();
    mp.destroy();
  }
});

test('submitHumanRetention enforces official max 5 capped and max 2 uncapped limits', () => {
  const pool = playersData as Player[];
  const uncapped = pool.filter((p) => p.isUncapped && p.previousTeamId === 'csk');
  const capped = pool.filter((p) => !p.isUncapped && p.previousTeamId === 'csk');
  const engine = new AuctionEngine(
    'RET001',
    'host-tok',
    { ...DEFAULT_ROOM_CONFIG, enableRetentionAndRTM: true, maxRetentionsAndRTM: 6 },
    { onStateChange: () => {}, onReaction: () => {} }
  );
  try {
    engine.assignHumanToTeam('csk', 'host-tok', 'Host');
    engine.startAuction();
    if (uncapped.length >= 3) {
      const errUncapped = engine.submitHumanRetention(
        'csk',
        uncapped.slice(0, 3).map((p) => p.id)
      );
      assert.equal(errUncapped, 'Max 2 uncapped retentions allowed');
    }
    if (capped.length >= 6) {
      const errCapped = engine.submitHumanRetention(
        'csk',
        capped.slice(0, 6).map((p) => p.id)
      );
      assert.equal(errCapped, 'Max 5 capped retentions allowed');
    }
  } finally {
    engine.destroy();
  }
});

test('skipping all sets after 3 retentions auto-fills human squad up to minSquadSize (18)', () => {
  const pool = playersData as Player[];
  const cskEligible = pool.filter((p) => p.previousTeamId === 'csk').slice(0, 3);
  const engine = new AuctionEngine(
    'FILL01',
    'host-tok',
    { ...DEFAULT_ROOM_CONFIG, mode: 'SINGLE_PLAYER', enableRetentionAndRTM: true },
    { onStateChange: () => {}, onReaction: () => {} }
  );
  try {
    engine.assignHumanToTeam('csk', 'host-tok', 'Host');
    engine.startAuction();
    const err = engine.submitHumanRetention(
      'csk',
      cskEligible.map((p) => p.id)
    );
    assert.equal(err, null);

    let guard = 0;
    while (engine.phase === 'BIDDING' && guard < 40) {
      engine.skipMultipleLots('SET', 0, 'csk');
      guard++;
    }

    const state = engine.getPublicState();
    assert.equal(state.phase, 'COMPLETED');
    assert.ok(
      state.teams['csk'].squad.length >= DEFAULT_ROOM_CONFIG.minSquadSize,
      `Expected >= ${DEFAULT_ROOM_CONFIG.minSquadSize} players, got ${state.teams['csk'].squad.length}`
    );
  } finally {
    engine.destroy();
  }
});
