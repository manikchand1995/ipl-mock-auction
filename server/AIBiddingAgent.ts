import { getMaxAllowedBidLakhs, validateBid } from '../shared/rules';
import { Player, RoomConfig, TeamState } from '../shared/types';

/**
 * Computes a dynamic maximum price (in Lakhs) that an AI franchise
 * is willing to pay for `player`, considering ratings, role needs,
 * personality, difficulty, and remaining purse per slot.
 */
export function computeAIMaxValuationLakhs(
  team: TeamState,
  player: Player,
  config: RoomConfig
): number {
  const maxLegal = getMaxAllowedBidLakhs(team, config);
  if (maxLegal < player.basePriceLakhs) return 0;

  // Base valuation curve from player overall rating (70 -> ~1.5 Cr, 85 -> ~6.5 Cr, 95 -> ~18 Cr)
  const rating = player.ratings.overall;
  let fairValue = player.basePriceLakhs;
  if (rating >= 93) fairValue = 1600 + (rating - 93) * 250;
  else if (rating >= 88) fairValue = 900 + (rating - 88) * 140;
  else if (rating >= 83) fairValue = 450 + (rating - 83) * 90;
  else if (rating >= 78) fairValue = 150 + (rating - 78) * 55;
  else fairValue = Math.max(player.basePriceLakhs, 50 + (rating - 70) * 15);

  // Role & bowling-type counts
  const wkCount = team.squad.filter((s) => s.player.role === 'WK').length;
  const bowlCount = team.squad.filter((s) => s.player.role === 'BOWL').length;
  const arCount = team.squad.filter((s) => s.player.role === 'AR').length;
  const batCount = team.squad.filter((s) => s.player.role === 'BAT').length;
  const openerCount = team.squad.filter(
    (s) => s.player.playingRole === 'OPENER'
  ).length;

  const isSpinnerRole = (p: Player) => {
    if (p.playingRole === 'SPIN_BOWL' || p.playingRole === 'SPIN_AR') return true;
    const s = p.bowlingStyle.toLowerCase();
    return s.includes('break') || s.includes('orthodox') || s.includes('spin');
  };
  const isPacerRole = (p: Player) => {
    if (p.playingRole === 'PACE_BOWL' || p.playingRole === 'PACE_AR') return true;
    const s = p.bowlingStyle.toLowerCase();
    return s.includes('fast') || s.includes('medium');
  };

  const spinnerCount = team.squad.filter((s) => isSpinnerRole(s.player)).length;
  const pacerCount = team.squad.filter((s) => isPacerRole(s.player)).length;

  let roleMultiplier = 1.0;
  if (player.role === 'WK') {
    if (wkCount === 0) roleMultiplier = 1.35;
    else if (wkCount >= 3) roleMultiplier = 0.5;
  } else if (player.role === 'BOWL') {
    if (bowlCount < 5) roleMultiplier = 1.32;
    else if (bowlCount >= 8) roleMultiplier = 0.6;
  } else if (player.role === 'AR') {
    if (arCount < 3) roleMultiplier = 1.22;
    else if (arCount >= 5) roleMultiplier = 0.65;
  } else if (player.role === 'BAT') {
    if (batCount < 4) roleMultiplier = 1.18;
    else if (batCount >= 7) roleMultiplier = 0.55;
  }

  if (player.playingRole === 'OPENER' && openerCount >= 4) {
    roleMultiplier *= 0.6;
  }

  // Home ground pitch fit + realistic pace/spin squad balance
  const pitchType = team.franchise.homeGround.pitchType;
  const playerIsSpinner = isSpinnerRole(player);
  const playerIsPacer = isPacerRole(player);

  let homeFitMultiplier = 1.0;
  if (playerIsSpinner) {
    if (spinnerCount >= 6) {
      homeFitMultiplier = 0.25; // Never hoard 7+ spinners
    } else if (spinnerCount >= 5) {
      homeFitMultiplier = 0.55;
    } else if (pitchType === 'SPIN_FRIENDLY' && spinnerCount < 4) {
      homeFitMultiplier = 1.28;
    } else if (spinnerCount < 3) {
      homeFitMultiplier = 1.22; // Every IPL squad needs 3-4 spinners
    }
  } else if (playerIsPacer) {
    if (pacerCount < 4) {
      homeFitMultiplier = 1.20; // Every IPL squad needs at least 4-5 pacers
    } else if (pacerCount >= 7) {
      homeFitMultiplier = 0.55;
    } else if (pitchType === 'PACE_BOUNCE' && player.ratings.bowling >= 75 && pacerCount < 6) {
      homeFitMultiplier = 1.16;
    }
  } else if (
    pitchType === 'BATTING_PARADISE' &&
    player.ratings.batting >= 84 &&
    (player.role === 'BAT' || player.role === 'WK' || player.role === 'AR')
  ) {
    homeFitMultiplier = 1.12;
  }

  // Purse pacing: scale gently by remaining purse ratio
  const slotsLeft = Math.max(1, config.minSquadSize - team.squad.length);
  const avgPursePerSlot = team.remainingPurseLakhs / slotsLeft;
  const purseFactor = Math.min(1.35, Math.max(0.55, avgPursePerSlot / 650));

  // Personality multiplier (value_hunter stops underbidding if it has surplus purse)
  let personalityMultiplier = 1.0;
  if (team.aiPersonality === 'aggressive') personalityMultiplier = 1.18;
  else if (team.aiPersonality === 'value_hunter') {
    personalityMultiplier = avgPursePerSlot > 750 ? 1.02 : 0.88;
  } else if (team.aiPersonality === 'star_chaser') {
    personalityMultiplier = rating >= 88 ? 1.28 : 0.85;
  }

  // Difficulty multiplier
  const difficultyMultiplier =
    config.aiDifficulty === 'SHARK'
      ? 1.12
      : config.aiDifficulty === 'CASUAL'
      ? 0.84
      : 1.0;

  // Small deterministic-ish jitter per player+team so AI doesn't always bid identically
  const seed =
    (team.franchise.id.charCodeAt(0) * 31 + player.id.charCodeAt(player.id.length - 1) * 17) %
    21;
  const jitter = 0.9 + seed * 0.01; // 0.90 to 1.10

  const valuation = Math.round(
    fairValue *
      roleMultiplier *
      homeFitMultiplier *
      personalityMultiplier *
      difficultyMultiplier *
      purseFactor *
      jitter
  );

  // Round to nearest 5L
  const rounded = Math.round(valuation / 5) * 5;
  return Math.min(maxLegal, Math.max(0, rounded));
}

export function shouldAIBid(
  team: TeamState,
  player: Player,
  nextBidLakhs: number,
  highestBidderTeamId: string | null,
  config: RoomConfig
): boolean {
  if (team.ownerType !== 'AI') return false;
  const check = validateBid(team, player, nextBidLakhs, highestBidderTeamId, config);
  if (!check.valid) return false;

  const maxVal = computeAIMaxValuationLakhs(team, player, config);
  return nextBidLakhs <= maxVal;
}

export function shouldAIUseRTM(
  team: TeamState,
  player: Player,
  finalOfferLakhs: number,
  config: RoomConfig
): boolean {
  if (team.ownerType !== 'AI') return false;
  if (team.rtmCardsRemaining <= 0) return false;
  const check = validateBid(team, player, finalOfferLakhs, null, config);
  if (!check.valid) return false;

  const maxVal = computeAIMaxValuationLakhs(team, player, config);
  return finalOfferLakhs <= Math.round(maxVal * 1.08);
}
