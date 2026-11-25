import { sortPlayingXIByOrder } from '../shared/rules';
import { AcquiredPlayer, TeamGrade, TeamState } from '../shared/types';

function computeGradeLetter(score: number): TeamGrade['grade'] {
  if (score >= 90) return 'S';
  if (score >= 84) return 'A+';
  if (score >= 78) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 62) return 'B';
  return 'C';
}

/**
 * Selects an optimal Playing XI (max 4 overseas, at least 1 WK) + 1 Impact Player
 * and computes batting, bowling, balance, and overall squad grades.
 */
export function gradeTeamSquad(team: TeamState): TeamGrade {
  const sorted = [...team.squad].sort(
    (a, b) => b.player.ratings.overall - a.player.ratings.overall
  );

  const playingXI: AcquiredPlayer[] = [];
  let overseasInXI = 0;

  const canAddToXI = (item: AcquiredPlayer): boolean => {
    if (playingXI.length >= 11) return false;
    if (playingXI.some((p) => p.player.id === item.player.id)) return false;
    if (item.player.isOverseas && overseasInXI >= 4) return false;
    return true;
  };

  const addToXI = (item: AcquiredPlayer | undefined) => {
    if (!item || !canAddToXI(item)) return;
    playingXI.push(item);
    if (item.player.isOverseas) overseasInXI++;
  };

  // 1. Ensure at least 1 Wicketkeeper
  addToXI(sorted.find((item) => item.player.role === 'WK' && canAddToXI(item)));

  // 2. Ensure core bowling attack: at least 2 Pacers + 2 Spinners (3 on spin-friendly) + 2 ARs
  const targetSpinners =
    team.franchise.homeGround.pitchType === 'SPIN_FRIENDLY' ? 3 : 2;
  for (const item of sorted) {
    if (
      playingXI.filter(
        (p) =>
          p.player.playingRole === 'PACE_BOWL' ||
          p.player.playingRole === 'PACE_AR'
      ).length >= 2
    ) {
      break;
    }
    if (
      item.player.playingRole === 'PACE_BOWL' ||
      item.player.playingRole === 'PACE_AR'
    ) {
      addToXI(item);
    }
  }
  for (const item of sorted) {
    if (
      playingXI.filter(
        (p) =>
          p.player.playingRole === 'SPIN_BOWL' ||
          p.player.playingRole === 'SPIN_AR'
      ).length >= targetSpinners
    ) {
      break;
    }
    if (
      item.player.playingRole === 'SPIN_BOWL' ||
      item.player.playingRole === 'SPIN_AR'
    ) {
      addToXI(item);
    }
  }
  for (const item of sorted) {
    if (playingXI.filter((p) => p.player.role === 'AR').length >= 2) break;
    if (item.player.role === 'AR') addToXI(item);
  }

  // 3. Ensure 2 specialist Openers + core batting lineup
  for (const item of sorted) {
    if (playingXI.filter((p) => p.player.playingRole === 'OPENER').length >= 2)
      break;
    if (item.player.playingRole === 'OPENER') addToXI(item);
  }
  for (const item of sorted) {
    if (playingXI.filter((p) => p.player.role === 'BAT').length >= 4) break;
    if (item.player.role === 'BAT') addToXI(item);
  }

  // 4. Ensure at least 5 total bowling options (BOWL + AR) before filling best remaining
  for (const item of sorted) {
    if (
      playingXI.filter((p) => p.player.role === 'BOWL' || p.player.role === 'AR')
        .length >= 5
    ) {
      break;
    }
    if (item.player.role === 'BOWL' || item.player.role === 'AR') addToXI(item);
  }

  // 5. Fill remaining XI slots by highest overall rating respecting max 4 overseas
  for (const item of sorted) {
    if (playingXI.length >= 11) break;
    addToXI(item);
  }

  // 6. Sort Playing XI by playingRole batting order (Opener -> Top Order -> Middle -> Finisher -> AR -> Bowler)
  const orderedXI = sortPlayingXIByOrder(playingXI);
  playingXI.splice(0, playingXI.length, ...orderedXI);

  // 3. Pick Impact Player from remaining squad
  const impactPlayer =
    sorted.find((item) => !playingXI.some((p) => p.player.id === item.player.id)) ?? null;

  // Compute sub-scores from XI
  const batters = playingXI.filter((p) => ['BAT', 'WK', 'AR'].includes(p.player.role));
  const bowlers = playingXI.filter((p) => ['BOWL', 'AR'].includes(p.player.role));

  const avgBatting =
    batters.length > 0
      ? batters.reduce((sum, p) => sum + p.player.ratings.batting, 0) / batters.length
      : 40;
  const avgBowling =
    bowlers.length > 0
      ? bowlers.reduce((sum, p) => sum + p.player.ratings.bowling, 0) / bowlers.length
      : 40;

  const wkCount = playingXI.filter((p) => p.player.role === 'WK').length;
  const arCount = playingXI.filter((p) => p.player.role === 'AR').length;
  const bowlCount = bowlers.length;

  let balanceScore = 60;
  if (wkCount >= 1) balanceScore += 10;
  if (bowlCount >= 5) balanceScore += 15;
  else if (bowlCount === 4) balanceScore += 8;
  if (arCount >= 2) balanceScore += 10;
  if (playingXI.length === 11) balanceScore += 5;
  balanceScore = Math.min(100, balanceScore);

  const battingScore = Math.round(Math.min(100, avgBatting));
  const bowlingScore = Math.round(Math.min(100, avgBowling));

  // Home ground fit score based on pitchType
  const pitch = team.franchise.homeGround.pitchType;
  const isSpinner = (b: string) => {
    const s = b.toLowerCase();
    return s.includes('break') || s.includes('orthodox') || s.includes('spin');
  };
  const isPacer = (b: string) => {
    const s = b.toLowerCase();
    return s.includes('fast') || s.includes('medium');
  };

  const xiSpinners = playingXI.filter(
    (p) => isSpinner(p.player.bowlingStyle) && p.player.ratings.bowling >= 65
  );
  const xiPacers = playingXI.filter(
    (p) => isPacer(p.player.bowlingStyle) && p.player.ratings.bowling >= 70
  );

  let homeAdvantageScore = 65;
  if (pitch === 'SPIN_FRIENDLY') {
    homeAdvantageScore += Math.min(25, xiSpinners.length * 10);
    if (avgBatting >= 80) homeAdvantageScore += 10;
  } else if (pitch === 'PACE_BOUNCE') {
    homeAdvantageScore += Math.min(25, xiPacers.length * 9);
    if (avgBatting >= 80) homeAdvantageScore += 10;
  } else if (pitch === 'BATTING_PARADISE') {
    homeAdvantageScore += battingScore >= 86 ? 22 : battingScore >= 80 ? 14 : 5;
    if (xiPacers.length >= 2) homeAdvantageScore += 13;
  } else {
    // BALANCED
    if (xiSpinners.length >= 2 && xiPacers.length >= 2) homeAdvantageScore += 22;
    else if (xiSpinners.length >= 1 && xiPacers.length >= 2) homeAdvantageScore += 14;
    if (arCount >= 2) homeAdvantageScore += 13;
  }
  homeAdvantageScore = Math.round(Math.min(100, homeAdvantageScore));

  const overallScore = Math.round(
    battingScore * 0.30 +
      bowlingScore * 0.30 +
      balanceScore * 0.25 +
      homeAdvantageScore * 0.15
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (battingScore >= 85) strengths.push('Explosive top-to-middle batting firepower');
  else if (battingScore < 72) weaknesses.push('Batting unit lacks star firepower');

  if (bowlingScore >= 85) strengths.push('Potent wicket-taking bowling attack');
  else if (bowlingScore < 72) weaknesses.push('Bowling attack may leak runs at the death');

  if (homeAdvantageScore >= 85) {
    strengths.push(
      `Tailored for ${team.franchise.homeGround.city} (${team.franchise.homeGround.pitchLabel})`
    );
  } else if (homeAdvantageScore < 72) {
    weaknesses.push(
      `Suboptimal fit for ${team.franchise.homeGround.city} (${team.franchise.homeGround.pitchLabel})`
    );
  }

  if (arCount >= 3) strengths.push('Deep all-rounder versatility');
  if (wkCount === 0) weaknesses.push('No specialist wicketkeeper in XI');
  if (bowlCount < 5) weaknesses.push('Short on 5th/6th bowling options');
  if (team.squad.length < 18) weaknesses.push(`Undersized squad (${team.squad.length}/18)`);

  if (strengths.length === 0) strengths.push('Well-rounded squad depth');
  if (weaknesses.length === 0) weaknesses.push('No glaring structural gaps');

  const bestValueBuy =
    [...team.squad].sort((a, b) => {
      const valA = a.player.ratings.overall / Math.max(30, a.priceLakhs);
      const valB = b.player.ratings.overall / Math.max(30, b.priceLakhs);
      return valB - valA;
    })[0] ?? null;

  const mostExpensiveBuy =
    [...team.squad].sort((a, b) => b.priceLakhs - a.priceLakhs)[0] ?? null;

  return {
    teamId: team.franchise.id,
    overallScore,
    grade: computeGradeLetter(overallScore),
    battingScore,
    bowlingScore,
    balanceScore,
    homeAdvantageScore,
    playingXI,
    impactPlayer,
    strengths,
    weaknesses,
    bestValueBuy,
    mostExpensiveBuy,
  };
}
