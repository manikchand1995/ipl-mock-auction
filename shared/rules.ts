import { MIN_BASE_PRICE_LAKHS, RETENTION_SLABS_LAKHS } from './constants';
import { AcquiredPlayer, Player, PlayingRole, RoomConfig, TeamState } from './types';

export const PLAYING_ROLE_LABELS: Record<PlayingRole, string> = {
  OPENER: 'Opener',
  TOP_ORDER: 'Top Order',
  MIDDLE_ORDER: 'Middle Order',
  FINISHER: 'Finisher',
  SPIN_AR: 'Spin All-Rounder',
  PACE_AR: 'Pace All-Rounder',
  SPIN_BOWL: 'Spinner',
  PACE_BOWL: 'Pace Bowler',
};

const PLAYING_ROLE_ORDER: Record<PlayingRole, number> = {
  OPENER: 0,
  TOP_ORDER: 1,
  MIDDLE_ORDER: 2,
  FINISHER: 3,
  SPIN_AR: 4,
  PACE_AR: 4,
  SPIN_BOWL: 5,
  PACE_BOWL: 5,
};

/**
 * Sorts a Playing XI into authentic cricket batting order:
 * Openers -> Top Order -> Middle Order -> Finishers -> All-Rounders -> Bowlers.
 */
export function sortPlayingXIByOrder(xi: AcquiredPlayer[]): AcquiredPlayer[] {
  const fallbackOrder: Record<string, number> = { BAT: 2, WK: 2, AR: 4, BOWL: 5 };
  return [...xi].sort((a, b) => {
    const ordA = a.player.playingRole
      ? PLAYING_ROLE_ORDER[a.player.playingRole]
      : fallbackOrder[a.player.role] ?? 2;
    const ordB = b.player.playingRole
      ? PLAYING_ROLE_ORDER[b.player.playingRole]
      : fallbackOrder[b.player.role] ?? 2;
    if (ordA !== ordB) return ordA - ordB;
    return b.player.ratings.batting - a.player.ratings.batting;
  });
}

/**
 * Formats an amount in Lakhs to a readable INR string (e.g. 1250 -> "₹12.50 Cr", 75 -> "₹75 L").
 */
export function formatINR(lakhs: number): string {
  if (lakhs >= 100) {
    const cr = lakhs / 100;
    return `₹${Number.isInteger(cr) ? cr.toFixed(0) : cr.toFixed(2).replace(/\.?0+$/, '')} Cr`;
  }
  return `₹${lakhs} L`;
}

/**
 * Returns the standard IPL auction bid increment based on the current bid in Lakhs.
 */
export function getBidIncrementLakhs(currentBidLakhs: number): number {
  if (currentBidLakhs < 100) return 5; // +₹5L up to ₹1 Cr
  if (currentBidLakhs < 200) return 10; // +₹10L up to ₹2 Cr
  if (currentBidLakhs < 500) return 20; // +₹20L up to ₹5 Cr
  return 25; // +₹25L above ₹5 Cr
}

/**
 * Calculates the next valid bid amount for the current lot.
 * If no team has bid yet, the opening bid equals the player's base price.
 */
export function getNextBidAmountLakhs(
  currentBidLakhs: number,
  highestBidderTeamId: string | null,
  basePriceLakhs: number
): number {
  if (!highestBidderTeamId) {
    return basePriceLakhs;
  }
  return currentBidLakhs + getBidIncrementLakhs(currentBidLakhs);
}

/**
 * Minimum purse a team must keep in reserve so it can still reach `minSquadSize`
 * at the minimum base price (₹30L) per remaining empty slot.
 */
export function getReservedPurseLakhs(
  team: TeamState,
  config: RoomConfig,
  afterAcquiringOne = false
): number {
  const projectedCount = team.squad.length + (afterAcquiringOne ? 1 : 0);
  const slotsNeeded = Math.max(0, config.minSquadSize - projectedCount);
  return slotsNeeded * MIN_BASE_PRICE_LAKHS;
}

/**
 * Maximum amount a team can legally bid right now without violating
 * squad minimum reserve rules.
 */
export function getMaxAllowedBidLakhs(team: TeamState, config: RoomConfig): number {
  const reserve = getReservedPurseLakhs(team, config, true);
  return Math.max(0, team.remainingPurseLakhs - reserve);
}

export function getOverseasCount(team: TeamState): number {
  return team.squad.filter((item) => item.player.isOverseas).length;
}

export interface BidValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates whether `team` can legally place `bidAmountLakhs` on `player`.
 */
export function validateBid(
  team: TeamState,
  player: Player,
  bidAmountLakhs: number,
  highestBidderTeamId: string | null,
  config: RoomConfig
): BidValidationResult {
  if (highestBidderTeamId === team.franchise.id) {
    return { valid: false, reason: 'You already hold the highest bid' };
  }

  if (team.squad.length >= config.maxSquadSize) {
    return { valid: false, reason: `Max squad size (${config.maxSquadSize}) reached` };
  }

  if (player.isOverseas && getOverseasCount(team) >= config.maxOverseas) {
    return { valid: false, reason: `Max overseas limit (${config.maxOverseas}) reached` };
  }

  const maxAllowed = getMaxAllowedBidLakhs(team, config);
  if (bidAmountLakhs > maxAllowed) {
    if (bidAmountLakhs > team.remainingPurseLakhs) {
      return { valid: false, reason: 'Insufficient purse' };
    }
    return {
      valid: false,
      reason: `Must reserve ${formatINR(getReservedPurseLakhs(team, config, true))} for min squad (${config.minSquadSize})`,
    };
  }

  return { valid: true };
}

/**
 * Calculates total retention cost in Lakhs for a list of retained players.
 * Uses IPL slabs: 18Cr, 14Cr, 11Cr, 18Cr, 14Cr, and 4Cr for uncapped.
 */
export function calculateRetentionCostLakhs(retainedPlayers: Player[]): number {
  let cappedIdx = 0;
  let total = 0;
  for (const p of retainedPlayers) {
    if (p.isUncapped) {
      total += 400; // ₹4 Cr for uncapped retention
    } else {
      const slab = RETENTION_SLABS_LAKHS[Math.min(cappedIdx, RETENTION_SLABS_LAKHS.length - 1)];
      total += slab;
      cappedIdx++;
    }
  }
  return total;
}
