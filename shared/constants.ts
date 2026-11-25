import { AIPersonality, AuctionSet, Franchise, RoomConfig } from './types';

export const IPL_FRANCHISES: Franchise[] = [
  {
    id: 'csk',
    name: 'Chennai Super Kings',
    shortName: 'CSK',
    primaryColor: '#F9CD05',
    secondaryColor: '#0081E9',
    homeGround: {
      stadium: 'M. A. Chidambaram Stadium (Chepauk)',
      city: 'Chennai',
      pitchType: 'SPIN_FRIENDLY',
      pitchLabel: 'Spin Turner',
      parScore: 172,
      summary: 'Gripping turner; quality spinners & middle-overs anchors thrive.',
    },
  },
  {
    id: 'mi',
    name: 'Mumbai Indians',
    shortName: 'MI',
    primaryColor: '#004BA0',
    secondaryColor: '#D1AB3E',
    homeGround: {
      stadium: 'Wankhede Stadium',
      city: 'Mumbai',
      pitchType: 'BATTING_PARADISE',
      pitchLabel: 'Batting Paradise',
      parScore: 196,
      summary: 'True bounce & short boundaries; explosive batters & death pacers shine.',
    },
  },
  {
    id: 'rcb',
    name: 'Royal Challengers Bengaluru',
    shortName: 'RCB',
    primaryColor: '#EC1C24',
    secondaryColor: '#2B2A29',
    homeGround: {
      stadium: 'M. Chinnaswamy Stadium',
      city: 'Bengaluru',
      pitchType: 'BATTING_PARADISE',
      pitchLabel: 'High-Scoring Deck',
      parScore: 208,
      summary: 'Small boundaries & flat deck; power-hitters & death-over bowlers are vital.',
    },
  },
  {
    id: 'kkr',
    name: 'Kolkata Knight Riders',
    shortName: 'KKR',
    primaryColor: '#3A225D',
    secondaryColor: '#B3A123',
    homeGround: {
      stadium: 'Eden Gardens',
      city: 'Kolkata',
      pitchType: 'BALANCED',
      pitchLabel: 'Sporting & Fast',
      parScore: 192,
      summary: 'Good carry early & grip later; mystery spin & big finishers excel.',
    },
  },
  {
    id: 'srh',
    name: 'Sunrisers Hyderabad',
    shortName: 'SRH',
    primaryColor: '#FF822A',
    secondaryColor: '#000000',
    homeGround: {
      stadium: 'Rajiv Gandhi Intl. Stadium',
      city: 'Hyderabad',
      pitchType: 'BATTING_PARADISE',
      pitchLabel: 'Flat Batting Deck',
      parScore: 202,
      summary: 'Flat track; aggressive top-order hitters & pace variations win games.',
    },
  },
  {
    id: 'rr',
    name: 'Rajasthan Royals',
    shortName: 'RR',
    primaryColor: '#EA1A85',
    secondaryColor: '#254AA5',
    homeGround: {
      stadium: 'Sawai Mansingh Stadium',
      city: 'Jaipur',
      pitchType: 'BALANCED',
      pitchLabel: 'Balanced & Spacious',
      parScore: 180,
      summary: 'Large square boundaries; wrist-spinners & athletic fielders gain an edge.',
    },
  },
  {
    id: 'dc',
    name: 'Delhi Capitals',
    shortName: 'DC',
    primaryColor: '#004C93',
    secondaryColor: '#EF1B23',
    homeGround: {
      stadium: 'Arun Jaitley Stadium',
      city: 'Delhi',
      pitchType: 'BATTING_PARADISE',
      pitchLabel: 'Quick Outfield',
      parScore: 194,
      summary: 'Short straight boundaries; stroke-makers & clever slower-ball bowlers shine.',
    },
  },
  {
    id: 'pbks',
    name: 'Punjab Kings',
    shortName: 'PBKS',
    primaryColor: '#ED1B24',
    secondaryColor: '#A7A9AC',
    homeGround: {
      stadium: 'Maharaja Yadavindra Singh Stadium',
      city: 'Mullanpur',
      pitchType: 'PACE_BOUNCE',
      pitchLabel: 'Pace & Bounce',
      parScore: 184,
      summary: 'Lively seam & bounce; hard-length pacers & counter-attacking batters thrive.',
    },
  },
  {
    id: 'gt',
    name: 'Gujarat Titans',
    shortName: 'GT',
    primaryColor: '#1B2133',
    secondaryColor: '#B89B5E',
    homeGround: {
      stadium: 'Narendra Modi Stadium',
      city: 'Ahmedabad',
      pitchType: 'PACE_BOUNCE',
      pitchLabel: 'True Bounce & Large',
      parScore: 186,
      summary: 'Big boundaries & true bounce; express pacers & deep batting lineups prevail.',
    },
  },
  {
    id: 'lsg',
    name: 'Lucknow Super Giants',
    shortName: 'LSG',
    primaryColor: '#00AEEF',
    secondaryColor: '#F36F21',
    homeGround: {
      stadium: 'Ekana Cricket Stadium',
      city: 'Lucknow',
      pitchType: 'SPIN_FRIENDLY',
      pitchLabel: 'Slow & Grippy',
      parScore: 170,
      summary: 'Two-paced surface; finger spinners, cutters & tactical batters dominate.',
    },
  },
];

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  mode: 'SINGLE_PLAYER',
  totalPurseLakhs: 12000, // ₹120 Cr
  minSquadSize: 18,
  maxSquadSize: 25,
  maxOverseas: 8,
  bidTimerSeconds: 10,
  bidResetSeconds: 6,
  enableRetentionAndRTM: true,
  maxRetentionsAndRTM: 6,
  aiDifficulty: 'COMPETITIVE',
};

export const AUCTION_SET_ORDER: AuctionSet[] = [
  'MARQUEE',
  'BAT',
  'AR',
  'WK',
  'FAST_BOWL',
  'SPIN_BOWL',
  'UNCAPPED',
];

export const AUCTION_SET_LABELS: Record<AuctionSet | 'ACCELERATED', string> = {
  MARQUEE: 'Marquee Set',
  BAT: 'Capped Batters',
  AR: 'Capped All-Rounders',
  WK: 'Capped Wicketkeepers',
  FAST_BOWL: 'Capped Fast Bowlers',
  SPIN_BOWL: 'Capped Spinners',
  UNCAPPED: 'Uncapped Gems',
  ACCELERATED: 'Accelerated Round',
};

// Retention cost slabs in Lakhs (IPL Mega Auction style)
export const RETENTION_SLABS_LAKHS = [1800, 1400, 1100, 1800, 1400, 400];

export const MIN_BASE_PRICE_LAKHS = 30; // ₹30 Lakhs

export const AI_PERSONALITIES: AIPersonality[] = [
  'aggressive',
  'balanced',
  'value_hunter',
  'star_chaser',
];

export const REACTION_EMOJIS = ['🔥', '💰', '🔨', '😱', '👏', '💀'];
