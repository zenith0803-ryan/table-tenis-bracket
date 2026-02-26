'use strict';

// ================================================================
// STATE
// ================================================================
let S = {
  screen: 'setup',
  tab: 'matches',
  settings: {
    gameType: 'singles',
    doublesMode: 'auto',
    scoringFormat: 'bo3',
    tournamentType: 'roundrobin',
    playerCount: 4,
  },
  players: [],
  teams: [],
  matches: [],
  modalMatchId: null,
};

let roomCode = null;
let pollTimer = null;
let matchIdSeed = 0;

// ================================================================
// CONSTANTS
// ================================================================
const LABEL = {
  gameType:    { singles: '단식', doubles: '복식', jjampong: '혼합 릴레이', dandokdan: '단복단' },
  format:      { bo3: '3판2승', bo5: '5판3승' },
  mode:        { roundrobin: '리그전', tournament: '토너먼트', group: '조별리그+토너먼트' },
  doublesMode: { auto: '자동 매칭', manual: '직접 구성' },
};
