import { sortPlayingXIByOrder } from '../shared/rules';
import {
  AcquiredPlayer,
  BatterInnings,
  BowlerFigures,
  ImpactSubInfo,
  InningsScorecard,
  PitchType,
  PlayerSeasonStats,
  SeasonSimulationResult,
  SimulatedMatchResult,
  StandingsRow,
  TeamGrade,
  TeamSeasonStats,
  TeamState,
} from '../shared/types';

/**
 * Selects a dynamic Match XI from the team's full squad based on:
 * 1) Recent player form (benching out-of-form players when bench depth exists)
 * 2) Venue pitch type (extra spinners on SPIN_FRIENDLY, extra pacers on PACE_BOUNCE)
 * 3) Opponent batting strength
 * Returns the 11 sorted in authentic cricket batting order.
 */
function selectDynamicMatchXI(
  team: TeamState,
  pitch: PitchType,
  opponentBattingScore: number,
  formMap: Record<string, number>
): AcquiredPlayer[] {
  const scored = team.squad
    .map((item) => {
      const p = item.player;
      let score = p.ratings.overall;
      const form = formMap[p.id] ?? 0;
      score += clamp(form, -14, 10);

      // Pitch adaptation
      if (pitch === 'SPIN_FRIENDLY') {
        if (p.playingRole === 'SPIN_BOWL' || p.playingRole === 'SPIN_AR') {
          score += 10;
        }
      } else if (pitch === 'PACE_BOUNCE') {
        if (p.playingRole === 'PACE_BOWL' || p.playingRole === 'PACE_AR') {
          score += 10;
        }
      } else if (pitch === 'BATTING_PARADISE') {
        if (p.playingRole === 'OPENER' || p.playingRole === 'FINISHER') {
          score += 6;
        }
      }

      // Opponent adaptation: against strong batting (84+), value high-rated bowlers
      if (opponentBattingScore >= 84 && (p.role === 'BOWL' || p.role === 'AR')) {
        score += 4;
      }

      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);

  const xi: AcquiredPlayer[] = [];
  let overseas = 0;

  const canAdd = (item: AcquiredPlayer) =>
    xi.length < 11 &&
    !xi.some((x) => x.player.id === item.player.id) &&
    (!item.player.isOverseas || overseas < 4);

  const add = (item: AcquiredPlayer | undefined) => {
    if (!item || !canAdd(item)) return;
    xi.push(item);
    if (item.player.isOverseas) overseas++;
  };

  // 1 WK, 2 Openers, at least 2 Pacers, 2 Spinners (3 on spin-friendly), 2 ARs, 5+ bowling options
  const targetSpinners = pitch === 'SPIN_FRIENDLY' ? 3 : 2;
  add(scored.find((x) => x.player.role === 'WK' && canAdd(x)));
  for (const x of scored) {
    if (xi.filter((p) => p.player.playingRole === 'OPENER').length >= 2) break;
    if (x.player.playingRole === 'OPENER') add(x);
  }
  for (const x of scored) {
    if (
      xi.filter(
        (p) => p.player.playingRole === 'PACE_BOWL' || p.player.playingRole === 'PACE_AR'
      ).length >= 2
    ) {
      break;
    }
    if (x.player.playingRole === 'PACE_BOWL' || x.player.playingRole === 'PACE_AR') {
      add(x);
    }
  }
  for (const x of scored) {
    if (
      xi.filter(
        (p) => p.player.playingRole === 'SPIN_BOWL' || p.player.playingRole === 'SPIN_AR'
      ).length >= targetSpinners
    ) {
      break;
    }
    if (x.player.playingRole === 'SPIN_BOWL' || x.player.playingRole === 'SPIN_AR') {
      add(x);
    }
  }
  for (const x of scored) {
    if (xi.filter((p) => p.player.role === 'AR').length >= 2) break;
    if (x.player.role === 'AR') add(x);
  }
  for (const x of scored) {
    if (
      xi.filter((p) => p.player.role === 'BOWL' || p.player.role === 'AR')
        .length >= 5
    ) {
      break;
    }
    if (x.player.role === 'BOWL' || x.player.role === 'AR') add(x);
  }
  for (const x of scored) {
    if (xi.length >= 11) break;
    add(x);
  }

  return sortPlayingXIByOrder(xi);
}

function updateFormAfterInnings(
  inn: InningsScorecard,
  formMap: Record<string, number>
): void {
  for (const b of inn.batters) {
    const prev = formMap[b.playerId] ?? 0;
    if (b.runs >= 45) formMap[b.playerId] = clamp(prev + 5, -15, 12);
    else if (b.runs >= 25) formMap[b.playerId] = clamp(prev + 2, -15, 12);
    else if (b.runs < 10 && b.outText !== 'not out') {
      formMap[b.playerId] = clamp(prev - 4, -15, 12);
    }
  }
  for (const bw of inn.bowlers) {
    const prev = formMap[bw.playerId] ?? 0;
    if (bw.wickets >= 2) formMap[bw.playerId] = clamp(prev + 5, -15, 12);
    else if (bw.wickets === 0 && bw.economy > 10.0) {
      formMap[bw.playerId] = clamp(prev - 4, -15, 12);
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatDateLabel(dayOffset: number): string {
  const base = new Date(2026, 2, 22); // Mar 22
  base.setDate(base.getDate() + Math.floor(dayOffset / 1.4));
  return base.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildInningsScorecard(
  battingTeam: TeamState,
  bowlingTeam: TeamState,
  battersXI: AcquiredPlayer[],
  bowlersXI: AcquiredPlayer[],
  targetTotalRuns: number,
  targetWickets: number,
  oversStr: string,
  totalBalls: number,
  requiredBowlerId?: string
): InningsScorecard {
  const extras = Math.min(12, Math.max(3, Math.round(targetTotalRuns * 0.04)));
  const runsToDistribute = Math.max(20, targetTotalRuns - extras);

  // Pick 5-8 bowlers (6 is most common; 5 and 7 are rare; 8 is rarest-rare if 8+ options & getting hit)
  const specialistBowlers = bowlersXI
    .filter((p) => p.player.role === 'BOWL' || p.player.role === 'AR')
    .sort((a, b) => b.player.ratings.bowling - a.player.ratings.bowling);
  let targetBowlerCount = 5;
  if (specialistBowlers.length >= 8 && targetTotalRuns >= 205 && Math.random() < 0.05) {
    targetBowlerCount = 8;
  } else if (specialistBowlers.length >= 7) {
    const r = Math.random();
    targetBowlerCount = r < 0.7 ? 6 : r < 0.85 ? 5 : 7;
  } else if (specialistBowlers.length === 6) {
    targetBowlerCount = Math.random() < 0.82 ? 6 : 5;
  }
  const selectedBowlers = (
    specialistBowlers.length >= targetBowlerCount
      ? specialistBowlers.slice(0, targetBowlerCount)
      : [
          ...specialistBowlers,
          ...bowlersXI.filter((p) => !specialistBowlers.includes(p)),
        ].slice(0, targetBowlerCount)
  ).slice(0, Math.max(1, Math.min(targetBowlerCount, bowlersXI.length)));

  if (
    requiredBowlerId &&
    selectedBowlers.length > 0 &&
    !selectedBowlers.some((b) => b.player.id === requiredBowlerId)
  ) {
    const req = bowlersXI.find((b) => b.player.id === requiredBowlerId);
    if (req) {
      selectedBowlers[selectedBowlers.length - 1] = req;
    }
  }

  // Distribute overs across selected bowlers (max 4 overs each)
  const oversInt = Math.floor(totalBalls / 6);
  const remBalls = totalBalls % 6;
  const nBowl = selectedBowlers.length;
  const bowlerOvers = new Array(nBowl).fill(0);
  if (nBowl === 8 && oversInt === 20) {
    const pattern = [4, 3, 3, 3, 2, 2, 2, 1];
    for (let i = 0; i < 8; i++) bowlerOvers[i] = pattern[i];
  } else if (nBowl === 8 && oversInt === 19) {
    const pattern = [4, 3, 3, 2, 2, 2, 2, 1];
    for (let i = 0; i < 8; i++) bowlerOvers[i] = pattern[i];
  } else if (nBowl === 7 && oversInt === 20) {
    const pattern = Math.random() < 0.5 ? [4, 4, 3, 3, 2, 2, 2] : [4, 4, 4, 3, 2, 2, 1];
    for (let i = 0; i < 7; i++) bowlerOvers[i] = pattern[i];
  } else if (nBowl === 7 && oversInt === 19) {
    const pattern = [4, 4, 3, 3, 2, 2, 1];
    for (let i = 0; i < 7; i++) bowlerOvers[i] = pattern[i];
  } else if (nBowl === 6 && oversInt === 20) {
    const pattern = Math.random() < 0.5 ? [4, 4, 4, 3, 3, 2] : [4, 4, 4, 4, 2, 2];
    for (let i = 0; i < 6; i++) bowlerOvers[i] = pattern[i];
  } else if (nBowl === 6 && oversInt === 19) {
    const pattern = [4, 4, 4, 3, 2, 2];
    for (let i = 0; i < 6; i++) bowlerOvers[i] = pattern[i];
  } else {
    let rem = oversInt;
    // Give each bowler 1 over first if possible
    for (let i = 0; i < nBowl && rem > 0; i++) {
      bowlerOvers[i] = 1;
      rem--;
    }
    // Top up front-line bowlers up to 4 overs (leaving room for remBalls on last bowler)
    let idx = 0;
    while (rem > 0) {
      const cap = idx === nBowl - 1 && remBalls > 0 ? 3 : 4;
      if (bowlerOvers[idx] < cap) {
        bowlerOvers[idx]++;
        rem--;
      }
      idx = (idx + 1) % nBowl;
      if (idx === 0 && bowlerOvers.every((o, i) => o >= (i === nBowl - 1 && remBalls > 0 ? 3 : 4))) {
        break;
      }
    }
  }

  // Distribute wickets among bowlers weighted by overs bowled * bowling rating (+ new-ball Powerplay boost)
  const bowlerWeights = selectedBowlers.map((b, idx) => {
    const ppNewBallBoost = idx < 2 ? 1.22 : 1.0;
    return Math.max(1, bowlerOvers[idx]) * Math.max(20, b.player.ratings.bowling) * ppNewBallBoost;
  });
  const bowlerWickets = new Array(selectedBowlers.length).fill(0);
  for (let w = 0; w < targetWickets; w++) {
    const totalW = bowlerWeights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalW;
    let chosen = 0;
    for (let i = 0; i < bowlerWeights.length; i++) {
      r -= bowlerWeights[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    bowlerWickets[chosen]++;
  }

  // Distribute runs conceded among bowlers with realistic T20 economy variance
  const bowlerWeightsEcon = selectedBowlers.map((b, idx) => {
    const skillFactor = Math.max(0.7, 1.35 - b.player.ratings.bowling / 140);
    return Math.max(0.5, bowlerOvers[idx] * skillFactor * (0.65 + Math.random() * 0.75));
  });
  const totalBowlEconW = bowlerWeightsEcon.reduce((a, b) => a + b, 0);
  const bowlerRuns = selectedBowlers.map((_, idx) =>
    Math.max(4, Math.round((bowlerWeightsEcon[idx] / Math.max(0.1, totalBowlEconW)) * targetTotalRuns))
  );
  const sumBowlRuns = bowlerRuns.reduce((a, b) => a + b, 0);
  if (bowlerRuns.length > 0) {
    bowlerRuns[0] = Math.max(0, bowlerRuns[0] + (targetTotalRuns - sumBowlRuns));
  }

  const bowlerFigures: BowlerFigures[] = selectedBowlers.map((b, idx) => {
    const ov =
      idx === selectedBowlers.length - 1 && remBalls > 0
        ? `${bowlerOvers[idx]}.${remBalls}`
        : `${bowlerOvers[idx]}.0`;
    const ovFloat =
      bowlerOvers[idx] +
      (idx === selectedBowlers.length - 1 ? remBalls / 6 : 0);
    const econ = ovFloat > 0 ? Number((bowlerRuns[idx] / ovFloat).toFixed(2)) : 0;
    return {
      playerId: b.player.id,
      name: b.player.name,
      overs: ov,
      runs: bowlerRuns[idx],
      wickets: bowlerWickets[idx],
      economy: econ,
    };
  });

  // Determine how many batters batted (wickets + 2, capped at XI length)
  const numBatted = Math.min(battersXI.length, targetWickets + 2);
  const activeBatters = battersXI.slice(0, numBatted);

  // Weight runs with realistic T20 variance (ducks/single-digits, cameos, 50s, 80-110* knocks)
  const heroIdx = Math.floor(Math.random() * Math.min(4, numBatted));
  const batWeights = activeBatters.map((b, idx) => {
    const posBoost = idx < 3 ? 1.35 : idx < 6 ? 1.0 : 0.48;
    const isOut = idx < targetWickets;
    const roll = Math.random();
    let fateMult: number;
    if (idx === heroIdx) {
      fateMult = 1.9 + Math.random() * 1.9; // Standout innings
    } else if (isOut && roll < 0.24) {
      fateMult = 0.02 + Math.random() * 0.14; // Duck or cheap dismissal (0-10)
    } else if (roll < 0.68) {
      fateMult = 0.35 + Math.random() * 0.6; // Start / cameo (12-35)
    } else if (roll < 0.92) {
      fateMult = 1.35 + Math.random() * 1.25; // Fifty-range knock
    } else {
      fateMult = 2.4 + Math.random() * 1.6; // Explosive 75-110+ knock
    }
    return Math.max(0.5, (b.player.ratings.batting / 80) * posBoost * fateMult);
  });
  const totalBatW = batWeights.reduce((a, b) => a + b, 0);

  const batterRuns = activeBatters.map((_, idx) =>
    Math.round((batWeights[idx] / Math.max(0.1, totalBatW)) * runsToDistribute)
  );
  // Adjust rounding difference on highest scorer so ducks stay at 0
  const sumRuns = batterRuns.reduce((a, b) => a + b, 0);
  if (batterRuns.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < batterRuns.length; i++) {
      if (batterRuns[i] > batterRuns[maxIdx]) maxIdx = i;
    }
    batterRuns[maxIdx] = Math.max(0, batterRuns[maxIdx] + (runsToDistribute - sumRuns));
  }

  // Distribute balls across batters with varied strike rates (anchors vs finishers vs early outs)
  const batterBalls = batterRuns.map((r, idx) => {
    if (r === 0) return Math.floor(1 + Math.random() * 3);
    const finisherBoost = idx >= 4 ? 0.2 : 0;
    const srTarget =
      0.95 +
      (activeBatters[idx].player.ratings.batting / 100) * 0.45 +
      finisherBoost +
      (Math.random() * 0.65 - 0.25);
    return Math.max(1, Math.round(r / Math.max(0.65, srTarget)));
  });
  const sumBalls = batterBalls.reduce((a, b) => a + b, 0);
  if (batterBalls.length > 0 && sumBalls > totalBalls) {
    const ratio = totalBalls / sumBalls;
    for (let i = 0; i < batterBalls.length; i++) {
      batterBalls[i] = Math.max(1, Math.round(batterBalls[i] * ratio));
    }
  }

  // Build wicket taker pool for dismissals
  const dismissalBowlers: string[] = [];
  bowlerFigures.forEach((bf) => {
    for (let k = 0; k < bf.wickets; k++) {
      dismissalBowlers.push(bf.name.split(' ').slice(-1)[0]);
    }
  });

  const notOutCount = Math.max(0, activeBatters.length - targetWickets);
  const notOutSet = new Set<number>();
  if (notOutCount > 0 && activeBatters.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < batterRuns.length; i++) {
      if (batterRuns[i] > batterRuns[maxIdx]) maxIdx = i;
    }
    if (batterRuns[maxIdx] >= 35 && Math.random() < 0.55) {
      notOutSet.add(maxIdx);
    }
    for (let i = activeBatters.length - 1; i >= 0 && notOutSet.size < notOutCount; i--) {
      notOutSet.add(i);
    }
  }
  let outCounter = 0;

  const batters: BatterInnings[] = activeBatters.map((b, idx) => {
    const r = batterRuns[idx];
    const balls = batterBalls[idx];
    // Overs 1-6 Powerplay: top-3 batters face field restrictions (2 outside circle -> more boundaries)
    const isPowerplayBatter = idx < 3;
    const sixFactor = isPowerplayBatter ? 0.3 + Math.random() * 0.3 : 0.25 + Math.random() * 0.3;
    const fourFactor = isPowerplayBatter ? 0.52 + Math.random() * 0.34 : 0.4 + Math.random() * 0.35;
    const sixes = Math.min(Math.floor(r / 10), Math.floor((r / 6) * sixFactor));
    const remForFours = Math.max(0, r - sixes * 6);
    const fours = Math.min(Math.floor(remForFours / 4), Math.floor((remForFours / 4) * fourFactor));
    const sr = balls > 0 ? Number(((r / balls) * 100).toFixed(1)) : 0;

    const isOut = !notOutSet.has(idx);
    let outText = 'not out';
    if (isOut) {
      const bName = dismissalBowlers[outCounter++] ?? 'Bowler';
      const catcher =
        bowlersXI[Math.floor(Math.random() * bowlersXI.length)]?.player.name
          .split(' ')
          .slice(-1)[0] ?? 'sub';
      outText = Math.random() < 0.28 ? `b ${bName}` : `c ${catcher} b ${bName}`;
    }

    return {
      playerId: b.player.id,
      name: b.player.name,
      role: b.player.role,
      runs: r,
      balls,
      fours,
      sixes,
      strikeRate: sr,
      outText,
    };
  });

  const yetToBat = battersXI.slice(numBatted).map((b) => ({
    playerId: b.player.id,
    name: b.player.name,
    role: b.player.role,
  }));

  // Powerplay (Overs 1-6): higher boundary & wicket volatility
  const ppShare = 0.27 + Math.random() * 0.1;
  const ppRuns = Math.min(targetTotalRuns, Math.max(24, Math.round(targetTotalRuns * ppShare)));
  const ppMaxWkts = Math.min(targetWickets, 4);
  const ppWicketRoll = Math.random();
  const ppWickets = Math.min(
    ppMaxWkts,
    ppWicketRoll < 0.16 ? 0 : ppWicketRoll < 0.54 ? 1 : ppWicketRoll < 0.84 ? 2 : 3
  );

  return {
    battingTeamId: battingTeam.franchise.id,
    bowlingTeamId: bowlingTeam.franchise.id,
    totalRuns: targetTotalRuns,
    wickets: targetWickets,
    overs: oversStr,
    extras,
    powerplayScore: `${ppRuns}/${ppWickets}`,
    batters,
    yetToBat,
    bowlers: bowlerFigures,
  };
}

function computeXIRatings(
  xi: AcquiredPlayer[],
  pitch: PitchType,
  formMap: Record<string, number>
): { bat: number; bowl: number; pitchFit: number } {
  const batters = xi.filter((p) => ['BAT', 'WK', 'AR'].includes(p.player.role));
  const bowlers = xi.filter((p) => ['BOWL', 'AR'].includes(p.player.role));

  const bat =
    batters.length > 0
      ? batters.reduce(
          (s, p) => s + p.player.ratings.batting + (formMap[p.player.id] ?? 0) * 0.35,
          0
        ) / batters.length
      : 65;
  const bowl =
    bowlers.length > 0
      ? bowlers.reduce(
          (s, p) => s + p.player.ratings.bowling + (formMap[p.player.id] ?? 0) * 0.35,
          0
        ) / bowlers.length
      : 65;

  const spinners = xi.filter(
    (p) => p.player.playingRole === 'SPIN_BOWL' || p.player.playingRole === 'SPIN_AR'
  ).length;
  const pacers = xi.filter(
    (p) => p.player.playingRole === 'PACE_BOWL' || p.player.playingRole === 'PACE_AR'
  ).length;

  let pitchFit = 70;
  if (pitch === 'SPIN_FRIENDLY') pitchFit += Math.min(24, spinners * 8);
  else if (pitch === 'PACE_BOUNCE') pitchFit += Math.min(24, pacers * 8);
  else if (pitch === 'BATTING_PARADISE') pitchFit += bat >= 84 ? 22 : 12;
  else pitchFit += spinners >= 2 && pacers >= 2 ? 20 : 10;

  return { bat, bowl, pitchFit };
}

function simulateMatch(
  id: string,
  matchNumber: number,
  dateLabel: string,
  stage: SimulatedMatchResult['stage'],
  homeTeam: TeamState,
  awayTeam: TeamState,
  grades: Record<string, TeamGrade>,
  formMap: Record<string, number>
): {
  result: SimulatedMatchResult;
  homeRuns: number;
  homeOvers: number;
  awayRuns: number;
  awayOvers: number;
} {
  const hg = grades[homeTeam.franchise.id];
  const ag = grades[awayTeam.franchise.id];
  const pitch = homeTeam.franchise.homeGround.pitchType;

  const homeXI = selectDynamicMatchXI(
    homeTeam,
    pitch,
    ag?.battingScore ?? 75,
    formMap
  );
  const awayXI = selectDynamicMatchXI(
    awayTeam,
    pitch,
    hg?.battingScore ?? 75,
    formMap
  );

  // Select Impact Player substitutions:
  // Home (bats 1st, bowls 2nd) subs in a bowler/AR for a pure batter before 2nd innings bowling.
  // Away (bowls 1st, chases 2nd) subs in a batter/AR for a pure bowler before 2nd innings chase.
  const pickImpactSub = (
    team: TeamState,
    xi: AcquiredPlayer[],
    preferRole: 'BOWL' | 'BAT'
  ): {
    updatedXI: AcquiredPlayer[];
    info: ImpactSubInfo;
  } | null => {
    const xiIds = new Set(xi.map((p) => p.player.id));
    const overseasInXI = xi.filter((p) => p.player.isOverseas).length;
    const bench = team.squad.filter((p) => !xiIds.has(p.player.id));
    if (bench.length === 0) return null;

    const scoreIn = (p: AcquiredPlayer) => {
      const form = formMap[p.player.id] ?? 0;
      const roleMatch =
        preferRole === 'BOWL'
          ? p.player.role === 'BOWL' || p.player.role === 'AR'
            ? 14
            : -8
          : p.player.role === 'BAT' || p.player.role === 'WK' || p.player.role === 'AR'
            ? 14
            : -8;
      const skill =
        preferRole === 'BOWL'
          ? p.player.ratings.bowling
          : p.player.ratings.batting;
      return skill + p.player.ratings.overall * 0.4 + roleMatch + form * 0.5;
    };

    const sortedBench = [...bench].sort((a, b) => scoreIn(b) - scoreIn(a));
    for (const inPlayer of sortedBench) {
      // Official IPL rule: if starting XI already has 4 overseas players,
      // an overseas Impact Player CANNOT be used (only Indian Impact Players allowed).
      if (inPlayer.player.isOverseas && overseasInXI >= 4) continue;
      const replaceable = xi;
      if (replaceable.length === 0) continue;

      // Replace a pure batter (when subbing in a bowler) or a bowler who actually bowled (when subbing in a batter)
      const likelyBowlerIds = new Set(
        xi
          .filter((p) => p.player.role === 'BOWL' || p.player.role === 'AR')
          .sort((a, b) => b.player.ratings.bowling - a.player.ratings.bowling)
          .slice(0, 5)
          .map((p) => p.player.id)
      );
      const outSorted = [...replaceable].sort((a, b) => {
        if (preferRole === 'BAT') {
          const aBowledPure =
            likelyBowlerIds.has(a.player.id) && a.player.role === 'BOWL'
              ? 0
              : likelyBowlerIds.has(a.player.id)
                ? 1
                : 2;
          const bBowledPure =
            likelyBowlerIds.has(b.player.id) && b.player.role === 'BOWL'
              ? 0
              : likelyBowlerIds.has(b.player.id)
                ? 1
                : 2;
          if (aBowledPure !== bBowledPure) return aBowledPure - bBowledPure;
          return a.player.ratings.batting - b.player.ratings.batting;
        }
        const aPref = a.player.role === 'BAT' || a.player.role === 'WK' ? 0 : 1;
        const bPref = b.player.role === 'BAT' || b.player.role === 'WK' ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
        return a.player.ratings.overall - b.player.ratings.overall;
      });

      const outPlayer = outSorted[0];
      let updatedXI = xi.map((p) =>
        p.player.id === outPlayer.player.id ? inPlayer : p
      );
      if (preferRole === 'BAT') {
        // Place the incoming batter at a natural batting-order slot instead of #10/#11
        const batOrderScore = (p: AcquiredPlayer) => {
          const r = p.player.playingRole;
          if (r === 'OPENER') return 1;
          if (r === 'TOP_ORDER') return 2;
          if (r === 'MIDDLE_ORDER') return 3;
          if (r === 'FINISHER') return 4;
          if (r === 'PACE_AR' || r === 'SPIN_AR') return 5;
          if (p.player.role === 'BAT' || p.player.role === 'WK') return 3;
          if (p.player.role === 'AR') return 5;
          return 6;
        };
        updatedXI = [...updatedXI].sort((a, b) => {
          const diff = batOrderScore(a) - batOrderScore(b);
          if (diff !== 0) return diff;
          return b.player.ratings.batting - a.player.ratings.batting;
        });
      }
      return {
        updatedXI,
        info: {
          inPlayerId: inPlayer.player.id,
          inPlayerName: inPlayer.player.name,
          outPlayerId: outPlayer.player.id,
          outPlayerName: outPlayer.player.name,
        },
      };
    }
    return null;
  };

  // Toss
  const tossWinner = Math.random() < 0.5 ? homeTeam : awayTeam;
  const tossDecision: 'bat' | 'bowl' =
    Math.random() < (pitch === 'SPIN_FRIENDLY' ? 0.45 : 0.7) ? 'bowl' : 'bat';
  const tossSummary = `${tossWinner.franchise.shortName} won the toss and elected to ${tossDecision} first`;
  const homeBatsFirst =
    (tossWinner === homeTeam && tossDecision === 'bat') ||
    (tossWinner === awayTeam && tossDecision === 'bowl');

  const batFirstTeam = homeBatsFirst ? homeTeam : awayTeam;
  const chaseTeam = homeBatsFirst ? awayTeam : homeTeam;
  const batFirstXI = homeBatsFirst ? homeXI : awayXI;
  const chaseXI = homeBatsFirst ? awayXI : homeXI;

  // Very rare (~5%) chance a team opts not to use an Impact Sub
  const batFirstImpact =
    Math.random() < 0.95 ? pickImpactSub(batFirstTeam, batFirstXI, 'BOWL') : null;
  const chaseImpact =
    Math.random() < 0.95 ? pickImpactSub(chaseTeam, chaseXI, 'BAT') : null;
  const batFirstXIForBowl = batFirstImpact ? batFirstImpact.updatedXI : batFirstXI;
  const chaseXIForBat = chaseImpact ? chaseImpact.updatedXI : chaseXI;

  const batFirstDynamic = computeXIRatings(batFirstXI, pitch, formMap);
  const chaseDynamic = computeXIRatings(chaseXIForBat, pitch, formMap);

  const getLeadershipBonus = (team: TeamState, xi: AcquiredPlayer[]) => {
    const cap = xi.find((p) => p.player.id === team.captainId);
    const vc = xi.find((p) => p.player.id === team.viceCaptainId);
    const activeLeader = cap ?? vc;
    return activeLeader ? (activeLeader.player.ratings.overall - 82) * 0.12 : 0;
  };
  const batFirstLeadBoost = getLeadershipBonus(batFirstTeam, batFirstXI);
  const chaseLeadBoost = getLeadershipBonus(chaseTeam, chaseXIForBat);

  const par = homeTeam.franchise.homeGround.parScore;
  const batFirstHomeBoost = homeBatsFirst
    ? (batFirstDynamic.pitchFit - 70) * 0.18
    : -(chaseDynamic.pitchFit - 70) * 0.08;
  const chaseHomeBoost = !homeBatsFirst
    ? (chaseDynamic.pitchFit - 70) * 0.18
    : -(batFirstDynamic.pitchFit - 70) * 0.08;

  const isNightMatch = Math.random() < 0.75;
  const dewChaseAdj = isNightMatch ? 3 : -2;

  const batFirstExpected =
    par +
    (batFirstDynamic.bat - chaseDynamic.bowl) * 0.45 +
    batFirstHomeBoost +
    batFirstLeadBoost +
    (Math.random() * 34 - 17);
  const chaseExpected =
    par +
    (chaseDynamic.bat - batFirstDynamic.bowl) * 0.45 +
    chaseHomeBoost +
    chaseLeadBoost +
    dewChaseAdj +
    (Math.random() * 34 - 17);

  const batFirstRuns = Math.round(clamp(batFirstExpected, 110, 255));
  const chaseRuns = Math.round(clamp(chaseExpected, 105, 255));

  const isTie = batFirstRuns === chaseRuns;
  let batFirstWon = batFirstRuns > chaseRuns;
  let superOverNote = '';

  if (isTie) {
    let so1 = Math.floor(6 + Math.random() * 15);
    let so2 = Math.floor(6 + Math.random() * 15);
    while (so1 === so2) {
      so1 = Math.floor(6 + Math.random() * 15);
      so2 = Math.floor(6 + Math.random() * 15);
    }
    batFirstWon = so1 > so2;
    const winSO = batFirstWon ? so1 : so2;
    const loseSO = batFirstWon ? so2 : so1;
    const soWinner = batFirstWon ? batFirstTeam : chaseTeam;
    superOverNote = `${soWinner.franchise.shortName} won via Super Over (${winSO} vs ${loseSO})`;
  }

  const winnerTeamId = batFirstWon
    ? batFirstTeam.franchise.id
    : chaseTeam.franchise.id;

  const formatOvers = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
  const ballsToFloat = (balls: number) =>
    Math.floor(balls / 6) + (balls % 6) / 6;

  // Allow 10-wicket all-outs on low totals or collapses
  let batFirstWickets = batFirstWon
    ? Math.floor(2 + Math.random() * 5)
    : Math.floor(6 + Math.random() * 4);
  if (
    !batFirstWon &&
    (batFirstRuns < 140 || (batFirstWickets === 9 && Math.random() < 0.45))
  ) {
    batFirstWickets = 10;
  }

  let chaseWickets = !batFirstWon && !isTie
    ? Math.floor(2 + Math.random() * 5)
    : Math.floor(6 + Math.random() * 4);
  if (
    batFirstWon &&
    !isTie &&
    (chaseRuns < batFirstRuns - 18 || (chaseWickets === 9 && Math.random() < 0.45))
  ) {
    chaseWickets = 10;
  }

  const batFirstBalls =
    batFirstWickets === 10 ? Math.floor(98 + Math.random() * 22) : 120;
  const batFirstOversStr = formatOvers(batFirstBalls);
  // Official IPL NRR rule: all-out innings counts as full 20.0 overs
  const batFirstNrrOvers = batFirstWickets === 10 ? 20 : ballsToFloat(batFirstBalls);

  let chaseTotalBalls = 120;
  if (!isTie && !batFirstWon) {
    const wktsInHand = 10 - chaseWickets;
    if (wktsInHand >= 8) chaseTotalBalls = Math.floor(94 + Math.random() * 17);
    else if (wktsInHand >= 5) chaseTotalBalls = Math.floor(105 + Math.random() * 13);
    else chaseTotalBalls = Math.floor(113 + Math.random() * 8);
  } else if (chaseWickets === 10) {
    chaseTotalBalls = Math.floor(98 + Math.random() * 22);
  }
  const chaseOversStr = formatOvers(chaseTotalBalls);
  const chaseNrrOvers = chaseWickets === 10 ? 20 : ballsToFloat(chaseTotalBalls);

  const innings1 = buildInningsScorecard(
    batFirstTeam,
    chaseTeam,
    batFirstXI,
    chaseXI,
    batFirstRuns,
    batFirstWickets,
    batFirstOversStr,
    batFirstBalls
  );
  if (batFirstImpact) innings1.battingImpactSub = batFirstImpact.info;
  if (chaseImpact) innings1.bowlingImpactSub = chaseImpact.info;

  const innings2 = buildInningsScorecard(
    chaseTeam,
    batFirstTeam,
    chaseXIForBat,
    batFirstXIForBowl,
    chaseRuns,
    chaseWickets,
    chaseOversStr,
    chaseTotalBalls,
    batFirstImpact?.info.inPlayerId
  );
  if (chaseImpact && innings2.batters.some((b) => b.playerId === chaseImpact.info.inPlayerId)) {
    innings2.battingImpactSub = chaseImpact.info;
  } else {
    delete innings1.bowlingImpactSub;
  }
  if (batFirstImpact) innings2.bowlingImpactSub = batFirstImpact.info;

  updateFormAfterInnings(innings1, formMap);
  updateFormAfterInnings(innings2, formMap);

  const marginText = isTie
    ? superOverNote
    : batFirstWon
      ? `${batFirstTeam.franchise.shortName} won by ${batFirstRuns - chaseRuns} runs`
      : `${chaseTeam.franchise.shortName} won by ${10 - chaseWickets} wickets`;

  // Pick top performer from winning innings
  const winInn = batFirstWon ? innings1 : innings2;
  const loseInn = batFirstWon ? innings2 : innings1;
  const topBat = [...winInn.batters].sort((a, b) => b.runs - a.runs)[0];
  const topBowl = [...loseInn.bowlers].sort(
    (a, b) => b.wickets - a.wickets || a.runs - b.runs
  )[0];
  const topPerformer =
    topBat && (!topBowl || topBat.runs >= topBowl.wickets * 22)
      ? `${topBat.name} (${topBat.runs}* off ${topBat.balls})`
      : topBowl
        ? `${topBowl.name} (${topBowl.wickets}/${topBowl.runs})`
        : 'Team Effort';

  const homeRuns = homeBatsFirst ? batFirstRuns : chaseRuns;
  const awayRuns = homeBatsFirst ? chaseRuns : batFirstRuns;
  const homeWickets = homeBatsFirst ? batFirstWickets : chaseWickets;
  const awayWickets = homeBatsFirst ? chaseWickets : batFirstWickets;
  const homeOversStr = homeBatsFirst ? batFirstOversStr : chaseOversStr;
  const awayOversStr = homeBatsFirst ? chaseOversStr : batFirstOversStr;
  const homeOvers = homeBatsFirst ? batFirstNrrOvers : chaseNrrOvers;
  const awayOvers = homeBatsFirst ? chaseNrrOvers : batFirstNrrOvers;

  return {
    result: {
      id,
      matchNumber,
      dateLabel,
      stage,
      homeTeamId: homeTeam.franchise.id,
      awayTeamId: awayTeam.franchise.id,
      stadium: homeTeam.franchise.homeGround.stadium,
      homeScore: `${homeRuns}/${homeWickets} (${homeOversStr})`,
      awayScore: `${awayRuns}/${awayWickets} (${awayOversStr})`,
      winnerTeamId,
      tossSummary,
      summary: marginText,
      topPerformer,
      innings1,
      innings2,
    },
    homeRuns,
    homeOvers,
    awayRuns,
    awayOvers,
  };
}

/**
 * Simulates a full 10-team double round-robin IPL league (18 matches per team)
 * followed by Qualifier 1, Eliminator, Qualifier 2, and Final, generating
 * full match scorecards, schedule timetable, player stats, and team stats.
 */
export function simulateIPLSeason(
  teams: Record<string, TeamState>,
  grades: Record<string, TeamGrade>
): SeasonSimulationResult {
  const teamList = Object.values(teams);
  const table: Record<
    string,
    StandingsRow & { runsFor: number; oversFor: number; runsAgainst: number; oversAgainst: number }
  > = {};
  const teamStatsMap: Record<string, TeamSeasonStats> = {};

  for (const t of teamList) {
    const id = t.franchise.id;
    table[id] = {
      teamId: id,
      played: 0,
      won: 0,
      lost: 0,
      points: 0,
      nrr: 0,
      runsFor: 0,
      oversFor: 0,
      runsAgainst: 0,
      oversAgainst: 0,
    };
    teamStatsMap[id] = {
      teamId: id,
      matches: 0,
      won: 0,
      lost: 0,
      totalRunsFor: 0,
      totalWicketsTaken: 0,
      highestTotal: 0,
      lowestTotal: 999,
      avgScore: 0,
      homeWins: 0,
      awayWins: 0,
    };
  }

  // Generate interleaved schedule pairs using Berger round-robin algorithm
  const n = teamList.length;
  const ids = teamList.map((t) => t.franchise.id);
  const fixtures: Array<{ homeId: string; awayId: string }> = [];

  for (let half = 0; half < 2; half++) {
    const rotation = [...ids];
    for (let round = 0; round < n - 1; round++) {
      for (let i = 0; i < n / 2; i++) {
        const t1 = rotation[i];
        const t2 = rotation[n - 1 - i];
        const homeId = (round + i + half) % 2 === 0 ? t1 : t2;
        const awayId = homeId === t1 ? t2 : t1;
        fixtures.push({ homeId, awayId });
      }
      const last = rotation.pop()!;
      rotation.splice(1, 0, last);
    }
  }

  const allMatches: SimulatedMatchResult[] = [];
  const formMap: Record<string, number> = {};
  let matchNum = 1;

  for (const fix of fixtures) {
    const home = teams[fix.homeId];
    const away = teams[fix.awayId];
    const sim = simulateMatch(
      `M${matchNum}`,
      matchNum,
      formatDateLabel(matchNum - 1),
      'LEAGUE',
      home,
      away,
      grades,
      formMap
    );
    allMatches.push(sim.result);
    matchNum++;

    const hRow = table[fix.homeId];
    const aRow = table[fix.awayId];
    hRow.played++;
    aRow.played++;
    hRow.runsFor += sim.homeRuns;
    hRow.oversFor += sim.homeOvers;
    hRow.runsAgainst += sim.awayRuns;
    hRow.oversAgainst += sim.awayOvers;
    aRow.runsFor += sim.awayRuns;
    aRow.oversFor += sim.awayOvers;
    aRow.runsAgainst += sim.homeRuns;
    aRow.oversAgainst += sim.homeOvers;

    if (sim.result.winnerTeamId === fix.homeId) {
      hRow.won++;
      hRow.points += 2;
      aRow.lost++;
    } else {
      aRow.won++;
      aRow.points += 2;
      hRow.lost++;
    }
  }

  const standings: StandingsRow[] = Object.values(table)
    .map((r) => {
      const nrr =
        r.runsFor / Math.max(1, r.oversFor) -
        r.runsAgainst / Math.max(1, r.oversAgainst);
      return {
        teamId: r.teamId,
        played: r.played,
        won: r.won,
        lost: r.lost,
        points: r.points,
        nrr: Number(nrr.toFixed(3)),
      };
    })
    .sort((a, b) => b.points - a.points || b.won - a.won || b.nrr - a.nrr);

  // Playoffs
  const seed1 = teams[standings[0].teamId];
  const seed2 = teams[standings[1].teamId];
  const seed3 = teams[standings[2].teamId];
  const seed4 = teams[standings[3].teamId];

  const q1 = simulateMatch(
    'Q1',
    matchNum++,
    formatDateLabel(92),
    'QUALIFIER_1',
    seed1,
    seed2,
    grades,
    formMap
  ).result;
  const elim = simulateMatch(
    'ELIM',
    matchNum++,
    formatDateLabel(94),
    'ELIMINATOR',
    seed3,
    seed4,
    grades,
    formMap
  ).result;

  const q1Winner = teams[q1.winnerTeamId];
  const q1Loser = q1.winnerTeamId === seed1.franchise.id ? seed2 : seed1;
  const elimWinner = teams[elim.winnerTeamId];

  const q2 = simulateMatch(
    'Q2',
    matchNum++,
    formatDateLabel(96),
    'QUALIFIER_2',
    q1Loser,
    elimWinner,
    grades,
    formMap
  ).result;
  const q2Winner = teams[q2.winnerTeamId];

  const finalMatch = simulateMatch(
    'FINAL',
    matchNum++,
    formatDateLabel(99),
    'FINAL',
    q1Winner,
    q2Winner,
    grades,
    formMap
  ).result;

  const playoffs = [q1, elim, q2, finalMatch];
  allMatches.push(...playoffs);

  // Aggregate Player & Team Season Stats from allMatches
  const playerMap: Record<
    string,
    PlayerSeasonStats & { bestW: number; bestR: number }
  > = {};

  const ensurePlayer = (
    id: string,
    name: string,
    teamId: string,
    role: PlayerSeasonStats['role']
  ) => {
    if (!playerMap[id]) {
      playerMap[id] = {
        playerId: id,
        name,
        teamId,
        role,
        matches: 0,
        runs: 0,
        balls: 0,
        strikeRate: 0,
        highScore: 0,
        fifties: 0,
        hundreds: 0,
        fours: 0,
        sixes: 0,
        wickets: 0,
        runsConceded: 0,
        oversBowled: 0,
        economy: 0,
        bestBowling: '-',
        bestW: -1,
        bestR: 999,
      };
    }
    return playerMap[id];
  };

  for (const m of allMatches) {
    const hStat = teamStatsMap[m.homeTeamId];
    const aStat = teamStatsMap[m.awayTeamId];
    hStat.matches++;
    aStat.matches++;
    hStat.totalRunsFor += m.innings1.totalRuns;
    aStat.totalRunsFor += m.innings2.totalRuns;
    hStat.totalWicketsTaken += m.innings2.wickets;
    aStat.totalWicketsTaken += m.innings1.wickets;
    hStat.highestTotal = Math.max(hStat.highestTotal, m.innings1.totalRuns);
    hStat.lowestTotal = Math.min(hStat.lowestTotal, m.innings1.totalRuns);
    aStat.highestTotal = Math.max(aStat.highestTotal, m.innings2.totalRuns);
    aStat.lowestTotal = Math.min(aStat.lowestTotal, m.innings2.totalRuns);

    if (m.winnerTeamId === m.homeTeamId) {
      hStat.won++;
      hStat.homeWins++;
      aStat.lost++;
    } else {
      aStat.won++;
      aStat.awayWins++;
      hStat.lost++;
    }

    const seenInMatch = new Set<string>();

    const recordInnings = (inn: InningsScorecard) => {
      const batTeam = teams[inn.battingTeamId];
      const bowlTeam = teams[inn.bowlingTeamId];

      for (const b of inn.batters) {
        const ps = ensurePlayer(b.playerId, b.name, batTeam.franchise.id, b.role);
        if (!seenInMatch.has(b.playerId)) {
          ps.matches++;
          seenInMatch.add(b.playerId);
        }
        ps.runs += b.runs;
        ps.balls += b.balls;
        ps.fours += b.fours;
        ps.sixes += b.sixes;
        if (b.runs > ps.highScore) ps.highScore = b.runs;
        if (b.runs >= 100) ps.hundreds++;
        else if (b.runs >= 50) ps.fifties++;
      }

      for (const bw of inn.bowlers) {
        const squadMatch = bowlTeam.squad.find((s) => s.player.id === bw.playerId);
        const role = squadMatch?.player.role ?? 'BOWL';
        const ps = ensurePlayer(bw.playerId, bw.name, bowlTeam.franchise.id, role);
        if (!seenInMatch.has(bw.playerId)) {
          ps.matches++;
          seenInMatch.add(bw.playerId);
        }
        ps.wickets += bw.wickets;
        ps.runsConceded += bw.runs;
        const [ovWhole, ovRem] = bw.overs.split('.').map(Number);
        ps.oversBowled += ovWhole + (ovRem || 0) / 6;
        if (
          bw.wickets > ps.bestW ||
          (bw.wickets === ps.bestW && bw.runs < ps.bestR)
        ) {
          ps.bestW = bw.wickets;
          ps.bestR = bw.runs;
          ps.bestBowling = `${bw.wickets}/${bw.runs}`;
        }
      }
    };

    recordInnings(m.innings1);
    recordInnings(m.innings2);
  }

  const playerStats: PlayerSeasonStats[] = Object.values(playerMap).map((ps) => {
    const mvpPoints = Math.round(
      ps.runs * 0.5 +
        ps.fours * 1.5 +
        ps.sixes * 2.5 +
        ps.wickets * 15 +
        ps.fifties * 10 +
        ps.hundreds * 25
    );
    return {
      playerId: ps.playerId,
      name: ps.name,
      teamId: ps.teamId,
      role: ps.role,
      matches: ps.matches,
      runs: ps.runs,
      balls: ps.balls,
      strikeRate: ps.balls > 0 ? Number(((ps.runs / ps.balls) * 100).toFixed(1)) : 0,
      highScore: ps.highScore,
      fifties: ps.fifties,
      hundreds: ps.hundreds,
      fours: ps.fours,
      sixes: ps.sixes,
      wickets: ps.wickets,
      runsConceded: ps.runsConceded,
      oversBowled: Number(ps.oversBowled.toFixed(1)),
      economy:
        ps.oversBowled > 0
          ? Number((ps.runsConceded / ps.oversBowled).toFixed(2))
          : 0,
      bestBowling: ps.bestBowling,
      mvpPoints,
    };
  });

  const teamStats: TeamSeasonStats[] = Object.values(teamStatsMap).map((ts) => ({
    ...ts,
    lowestTotal: ts.lowestTotal === 999 ? 0 : ts.lowestTotal,
    avgScore: ts.matches > 0 ? Math.round(ts.totalRunsFor / ts.matches) : 0,
  }));

  const championTeamId = finalMatch.winnerTeamId;
  const runnerUpTeamId =
    championTeamId === q1Winner.franchise.id
      ? q2Winner.franchise.id
      : q1Winner.franchise.id;

  const orangeCap = [...playerStats].sort((a, b) => b.runs - a.runs)[0];
  const mvpText = orangeCap
    ? `${orangeCap.name} (${teams[orangeCap.teamId]?.franchise.shortName} • ${orangeCap.runs} runs)`
    : `${teams[championTeamId].franchise.shortName}`;

  return {
    standings,
    matches: allMatches,
    playoffs,
    playerStats,
    teamStats,
    championTeamId,
    runnerUpTeamId,
    mvpText,
  };
}
