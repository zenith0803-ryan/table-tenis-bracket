// ================================================================
// ROUND ROBIN
// ================================================================
// Circle-method round robin → returns array of rounds
function rrSchedule(items) {
  let list = [...items];
  if (list.length % 2 === 1) list.push(null); // bye slot
  const n = list.length;
  const rounds = [];
  const fixed = list[0];
  let rot = list.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const cur = [fixed, ...rot];
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const a = cur[i], b = cur[n - 1 - i];
      if (a && b) round.push([a, b]);
    }
    rounds.push(round);
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  return rounds;
}

function genRoundRobin(players, type = 'singles') {
  const rounds = rrSchedule(players);
  const matches = [];
  rounds.forEach((round, ri) => {
    round.forEach(([p1, p2]) => {
      matches.push(mkMatch({
        type, phase: 'roundrobin', round: ri + 1,
        player1: p1.name, player2: p2.name, p1id: p1.id, p2id: p2.id,
      }));
    });
  });
  return matches;
}

// BYE 분산 배치: 각 매치에 최대 1개 BYE만 오도록 배열
function spreadByes(players, slots) {
  const numByes = slots - players.length;
  if (numByes === 0) return [...players];
  // BYE를 마지막 매치 쌍의 두 번째 슬롯부터 배치
  const result = new Array(slots).fill(null);
  const byeSlots = new Set();
  for (let b = 0; b < numByes; b++) {
    byeSlots.add(slots - 1 - b * 2);
  }
  let pi = 0;
  for (let i = 0; i < slots; i++) {
    if (!byeSlots.has(i) && pi < players.length) {
      result[i] = players[pi++];
    }
  }
  return result;
}

// ================================================================
// SINGLE ELIMINATION TOURNAMENT
// ================================================================
function genTournament(players, type = 'singles') {
  const shuffled = shuffle(players);
  const rounds = Math.ceil(Math.log2(shuffled.length));
  const slots = Math.pow(2, rounds);
  const seeded = spreadByes(shuffled, slots);

  const matches = [];

  // Round 1
  for (let i = 0; i < slots / 2; i++) {
    const p1 = seeded[i * 2], p2 = seeded[i * 2 + 1];
    const bye = !p1 || !p2;
    const winner = bye ? (p1 || p2) : null;
    matches.push(mkMatch({
      type, phase: 'tournament', round: 1,
      player1: p1 ? p1.name : 'BYE', player2: p2 ? p2.name : 'BYE',
      p1id: p1 ? p1.id : -1, p2id: p2 ? p2.id : -1,
      winner: winner ? winner.name : null, isBye: bye,
    }));
  }

  // Later rounds (placeholders)
  let prev = slots / 2;
  for (let r = 2; r <= rounds; r++) {
    const cnt = prev / 2;
    for (let i = 0; i < cnt; i++) {
      matches.push(mkMatch({ type, phase: 'tournament', round: r, player1: '?', player2: '?', pending: true }));
    }
    prev = cnt;
  }

  advanceTournament(matches);
  return matches;
}

function advanceTournament(matches) {
  const byRound = {};
  matches.filter(m => m.phase === 'tournament').forEach(m => {
    (byRound[m.round] = byRound[m.round] || []).push(m);
  });
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < rounds.length - 1; i++) {
    const cur = byRound[rounds[i]];
    const nxt = byRound[rounds[i + 1]];
    for (let j = 0; j < cur.length; j += 2) {
      const m1 = cur[j], m2 = cur[j + 1];
      const nm = nxt[Math.floor(j / 2)];
      if (!nm) continue;
      if (m1?.winner) { nm.player1 = m1.winner; nm.p1id = m1.winner === m1.player1 ? m1.p1id : m1.p2id; }
      if (m2?.winner) { nm.player2 = m2.winner; nm.p2id = m2.winner === m2.player1 ? m2.p1id : m2.p2id; }
      if (nm.player1 !== '?' && nm.player2 !== '?') nm.pending = false;
    }
  }
}

// ================================================================
// DOUBLES
// ================================================================
// existingTeams: 직접 구성 팀 배열 (auto 모드에서는 빈 배열)
function genDoubles(players, doublesMode, tournamentType, existingTeams = []) {
  let teams = existingTeams;
  if (doublesMode === 'auto') {
    const sh = shuffle(players);
    teams = [];
    for (let i = 0; i < Math.floor(sh.length / 2); i++) {
      const a = sh[i * 2], b = sh[i * 2 + 1];
      teams.push({ id: i + 1, p1id: a.id, p2id: b.id, p1: a.name, p2: b.name, name: `${a.name} / ${b.name}` });
    }
  }
  const tp = teams.map(t => ({ id: t.id, name: t.name }));
  const matches = tournamentType === 'roundrobin'
    ? genRoundRobin(tp, 'doubles')
    : genTournament(tp, 'doubles');
  return { teams, matches };
}

// ================================================================
// JJAMPONG (혼합 릴레이)
// ================================================================
function genJjampong(players) {
  // Singles: full round robin
  const singles = genRoundRobin(players, 'singles');
  singles.forEach(m => { m.phase = 'singles'; });

  // Doubles: rotating random pairings
  const doubles = [];
  const n = players.length;
  const numRounds = n % 2 === 1 ? n : Math.max(3, Math.floor(n / 2));

  for (let r = 0; r < numRounds; r++) {
    let referee = null;
    let pool = [...players];

    if (n % 2 === 1) {
      referee = players[r % n];
      pool = players.filter(p => p.id !== referee.id);
    }

    const sh = shuffle(pool);
    for (let i = 0; i + 3 < sh.length; i += 4) {
      doubles.push(mkMatch({
        type: 'doubles', phase: 'doubles', round: r + 1,
        player1: `${sh[i].name} / ${sh[i + 1].name}`,
        player2: `${sh[i + 2].name} / ${sh[i + 3].name}`,
        referee: referee ? referee.name : null,
      }));
    }
  }

  return [...singles, ...doubles];
}

// ================================================================
// 단단복 (단식-단식-복식)
// ================================================================
let teamMatchIdSeed = 0;

function genDandokdan(players, doublesMode, tournamentType, existingTeams = []) {
  let teams = existingTeams;
  if (doublesMode === 'auto') {
    const sh = shuffle(players);
    teams = [];
    for (let i = 0; i < Math.floor(sh.length / 2); i++) {
      const a = sh[i * 2], b = sh[i * 2 + 1];
      teams.push({ id: i + 1, p1id: a.id, p2id: b.id, p1: a.name, p2: b.name, name: `${a.name} / ${b.name}` });
    }
  }

  // 팀 간 대진 생성 (리그전 or 토너먼트)
  const tp = teams.map(t => ({ id: t.id, name: t.name }));
  let teamSchedule;
  if (tournamentType === 'roundrobin') {
    const rounds = rrSchedule(tp);
    teamSchedule = [];
    rounds.forEach((round, ri) => {
      round.forEach(([t1, t2]) => {
        teamSchedule.push({ t1id: t1.id, t2id: t2.id, round: ri + 1 });
      });
    });
  } else {
    // 토너먼트: 단순 셔플 → 짝 매칭
    const sh = shuffle(tp);
    teamSchedule = [];
    for (let i = 0; i < Math.floor(sh.length / 2); i++) {
      teamSchedule.push({ t1id: sh[i * 2].id, t2id: sh[i * 2 + 1].id, round: 1 });
    }
  }

  // 각 팀 대결 → 3경기(단단복) 생성
  teamMatchIdSeed = 0;
  const matches = [];
  teamSchedule.forEach(({ t1id, t2id, round }) => {
    const t1 = teams.find(t => t.id === t1id);
    const t2 = teams.find(t => t.id === t2id);
    const tmId = ++teamMatchIdSeed;

    // 단식1: A팀1번 vs B팀1번
    matches.push(mkMatch({
      type: 'singles', phase: 'dandokdan', round,
      player1: t1.p1, player2: t2.p1,
      p1id: t1.p1id, p2id: t2.p1id,
      teamMatchId: tmId, subRound: 1,
    }));
    // 단식2: A팀2번 vs B팀2번
    matches.push(mkMatch({
      type: 'singles', phase: 'dandokdan', round,
      player1: t1.p2, player2: t2.p2,
      p1id: t1.p2id, p2id: t2.p2id,
      teamMatchId: tmId, subRound: 2,
    }));
    // 복식: A팀(1+2) vs B팀(1+2)
    matches.push(mkMatch({
      type: 'doubles', phase: 'dandokdan', round,
      player1: t1.name, player2: t2.name,
      p1id: t1.id, p2id: t2.id,
      teamMatchId: tmId, subRound: 3,
    }));
  });

  return { teams, matches };
}

// 2선승 확인 → 나머지 경기 voided 처리
function checkTeamBoutWinner(teamMatchId) {
  const bout = S.matches.filter(m => m.teamMatchId === teamMatchId);
  if (bout.length === 0) return;

  // 각 팀 대결에서 팀1 = subRound1의 player1 쪽, 팀2 = subRound1의 player2 쪽
  let t1wins = 0, t2wins = 0;
  bout.forEach(m => {
    if (!m.winner || m.voided) return;
    if (m.subRound === 1 || m.subRound === 3) {
      // 단식: player1 = 팀1 선수, player2 = 팀2 선수
      if (m.winner === m.player1) t1wins++;
      else t2wins++;
    } else {
      // 복식: player1 = 팀1 이름, player2 = 팀2 이름
      if (m.winner === m.player1) t1wins++;
      else t2wins++;
    }
  });

  // 2선승 달성 시 나머지 경기 voided
  if (t1wins >= 2 || t2wins >= 2) {
    bout.forEach(m => {
      if (!m.winner && !m.voided) {
        m.voided = true;
      }
    });
  }
}

// ================================================================
// 조별 리그 + 상위/하위부 토너먼트
// ================================================================
// Snake draft 조 배정 헬퍼
function snakeDraft(items) {
  items.forEach((item, i) => {
    const row = Math.floor(i / 2);
    item.group = (row % 2 === 0) ? (i % 2 === 0 ? 'A' : 'B') : (i % 2 === 0 ? 'B' : 'A');
  });
}

function genGroupTournament(players, gameType = 'singles', doublesMode = 'auto', existingTeams = []) {
  if (gameType === 'singles') {
    return genGroupTournamentSingles(players);
  } else if (gameType === 'doubles') {
    return genGroupTournamentDoubles(players, doublesMode, existingTeams);
  } else if (gameType === 'dandokdan') {
    return genGroupTournamentDandokdan(players, doublesMode, existingTeams);
  }
  return genGroupTournamentSingles(players);
}

function genGroupTournamentSingles(players) {
  const hasBuso = players.some(p => p.buso);
  const sorted = hasBuso
    ? [...players].sort((a, b) => (a.buso || 99) - (b.buso || 99))
    : shuffle(players);

  snakeDraft(sorted);

  const groupA = players.filter(p => p.group === 'A');
  const groupB = players.filter(p => p.group === 'B');

  const matchesA = genRoundRobin(groupA, 'singles');
  matchesA.forEach(m => { m.phase = 'group'; m.groupId = 'A'; });
  const matchesB = genRoundRobin(groupB, 'singles');
  matchesB.forEach(m => { m.phase = 'group'; m.groupId = 'B'; });

  const halfA = Math.ceil(groupA.length / 2);
  const halfB = Math.ceil(groupB.length / 2);
  const upperCount = halfA + halfB;
  const lowerCount = (groupA.length - halfA) + (groupB.length - halfB);

  const upperMatches = genEmptyBracket(upperCount, 'upper');
  const lowerMatches = genEmptyBracket(lowerCount, 'lower');

  return [...matchesA, ...matchesB, ...upperMatches, ...lowerMatches];
}

function genGroupTournamentDoubles(players, doublesMode, existingTeams) {
  // 팀 생성
  let teams = existingTeams;
  if (doublesMode === 'auto') {
    const sh = shuffle(players);
    teams = [];
    for (let i = 0; i < Math.floor(sh.length / 2); i++) {
      const a = sh[i * 2], b = sh[i * 2 + 1];
      teams.push({ id: i + 1, p1id: a.id, p2id: b.id, p1: a.name, p2: b.name, name: `${a.name} / ${b.name}` });
    }
  }

  // 팀을 snake draft로 A/B조 배정
  const sortedTeams = [...teams];
  snakeDraft(sortedTeams);

  const groupA = sortedTeams.filter(t => t.group === 'A').map(t => ({ id: t.id, name: t.name }));
  const groupB = sortedTeams.filter(t => t.group === 'B').map(t => ({ id: t.id, name: t.name }));

  // 조별 리그 (복식 RR)
  const matchesA = genRoundRobin(groupA, 'doubles');
  matchesA.forEach(m => { m.phase = 'group'; m.groupId = 'A'; });
  const matchesB = genRoundRobin(groupB, 'doubles');
  matchesB.forEach(m => { m.phase = 'group'; m.groupId = 'B'; });

  // 상위/하위부 빈 bracket
  const halfA = Math.ceil(groupA.length / 2);
  const halfB = Math.ceil(groupB.length / 2);
  const upperCount = halfA + halfB;
  const lowerCount = (groupA.length - halfA) + (groupB.length - halfB);

  const upperMatches = genEmptyBracket(upperCount, 'upper', 'doubles');
  const lowerMatches = genEmptyBracket(lowerCount, 'lower', 'doubles');

  return { teams, matches: [...matchesA, ...matchesB, ...upperMatches, ...lowerMatches] };
}

function genGroupTournamentDandokdan(players, doublesMode, existingTeams) {
  // 팀 생성
  let teams = existingTeams;
  if (doublesMode === 'auto') {
    const sh = shuffle(players);
    teams = [];
    for (let i = 0; i < Math.floor(sh.length / 2); i++) {
      const a = sh[i * 2], b = sh[i * 2 + 1];
      teams.push({ id: i + 1, p1id: a.id, p2id: b.id, p1: a.name, p2: b.name, name: `${a.name} / ${b.name}` });
    }
  }

  // 팀을 snake draft로 A/B조 배정
  const sortedTeams = [...teams];
  snakeDraft(sortedTeams);

  const teamGroupA = sortedTeams.filter(t => t.group === 'A');
  const teamGroupB = sortedTeams.filter(t => t.group === 'B');

  // 조별 리그: 각 조 내에서 팀 대결 (단단복 bout)
  teamMatchIdSeed = 0;
  const genGroupBouts = (teamGroup, groupId) => {
    const tp = teamGroup.map(t => ({ id: t.id, name: t.name }));
    const rounds = rrSchedule(tp);
    const matches = [];
    rounds.forEach((round, ri) => {
      round.forEach(([t1ref, t2ref]) => {
        const t1 = teams.find(t => t.id === t1ref.id);
        const t2 = teams.find(t => t.id === t2ref.id);
        const tmId = ++teamMatchIdSeed;

        // 단식1
        matches.push(mkMatch({
          type: 'singles', phase: 'group', round: ri + 1, groupId,
          player1: t1.p1, player2: t2.p1,
          p1id: t1.p1id, p2id: t2.p1id,
          teamMatchId: tmId, subRound: 1,
        }));
        // 단식2
        matches.push(mkMatch({
          type: 'singles', phase: 'group', round: ri + 1, groupId,
          player1: t1.p2, player2: t2.p2,
          p1id: t1.p2id, p2id: t2.p2id,
          teamMatchId: tmId, subRound: 2,
        }));
        // 복식
        matches.push(mkMatch({
          type: 'doubles', phase: 'group', round: ri + 1, groupId,
          player1: t1.name, player2: t2.name,
          p1id: t1.id, p2id: t2.id,
          teamMatchId: tmId, subRound: 3,
        }));
      });
    });
    return matches;
  };

  const matchesA = genGroupBouts(teamGroupA, 'A');
  const matchesB = genGroupBouts(teamGroupB, 'B');

  // 상위/하위부 빈 bracket (단단복 bout 형식)
  const halfA = Math.ceil(teamGroupA.length / 2);
  const halfB = Math.ceil(teamGroupB.length / 2);
  const upperCount = halfA + halfB;
  const lowerCount = (teamGroupA.length - halfA) + (teamGroupB.length - halfB);

  // 단단복의 bracket은 팀 bout 형식이므로 doubles type으로 빈 bracket 생성
  // (advanceGroupTournament에서 실제 bout 매치로 교체)
  const upperMatches = genEmptyBracket(upperCount, 'upper', 'doubles');
  const lowerMatches = genEmptyBracket(lowerCount, 'lower', 'doubles');

  return { teams, matches: [...matchesA, ...matchesB, ...upperMatches, ...lowerMatches] };
}

// 빈 토너먼트 bracket 생성 (선수 미정)
function genEmptyBracket(count, phase, type = 'singles') {
  if (count < 2) return [];
  const rounds = Math.ceil(Math.log2(count));
  const slots = Math.pow(2, rounds);
  const matches = [];

  // Round 1
  for (let i = 0; i < slots / 2; i++) {
    matches.push(mkMatch({
      type, phase, round: 1,
      player1: '?', player2: '?', pending: true,
    }));
  }
  // Later rounds
  let prev = slots / 2;
  for (let r = 2; r <= rounds; r++) {
    const cnt = prev / 2;
    for (let i = 0; i < cnt; i++) {
      matches.push(mkMatch({ type, phase, round: r, player1: '?', player2: '?', pending: true }));
    }
    prev = cnt;
  }
  return matches;
}

// 조별 리그 완료 → 상위/하위부 자동 배치
function advanceGroupTournament() {
  const { gameType } = S.settings;

  if (gameType === 'dandokdan') {
    advanceGroupTournamentDandokdan();
    return;
  }

  const groupMatches = S.matches.filter(m => m.phase === 'group');
  const upperMatches = S.matches.filter(m => m.phase === 'upper');
  const lowerMatches = S.matches.filter(m => m.phase === 'lower');

  if (upperMatches.length === 0) return;

  // 조별 리그 전부 완료됐는지 확인
  const allGroupDone = groupMatches.every(m => m.winner || m.isBye);
  if (!allGroupDone) return;

  // 상위부 1라운드가 이미 배치됐으면 스킵
  const upperR1 = upperMatches.filter(m => m.round === 1);
  if (upperR1.some(m => m.player1 !== '?' || m.player2 !== '?')) return;

  const isDoubles = gameType === 'doubles';

  // A/B조 항목 (단식: players, 복식: teams)
  const allItems = isDoubles
    ? S.teams.map(t => ({ id: t.id, name: t.name, buso: null, group: t.group }))
    : S.players;
  const groupA = allItems.filter(p => p.group === 'A');
  const groupB = allItems.filter(p => p.group === 'B');
  const statsA = buildStats(groupA, groupMatches.filter(m => m.groupId === 'A'));
  const statsB = buildStats(groupB, groupMatches.filter(m => m.groupId === 'B'));

  const halfA = Math.ceil(groupA.length / 2);
  const halfB = Math.ceil(groupB.length / 2);

  // 교차 시드: A조1 vs B조2, B조1 vs A조2 ...
  const seedCross = (stA, stB, count) => {
    const seeded = [];
    const aTop = stA.slice(0, Math.ceil(count / 2));
    const bTop = stB.slice(0, Math.ceil(count / 2));
    for (let i = 0; i < Math.max(aTop.length, bTop.length); i++) {
      if (aTop[i]) seeded.push(allItems.find(p => p.name === aTop[i].name));
      if (bTop[i]) seeded.push(allItems.find(p => p.name === bTop[i].name));
    }
    return seeded;
  };

  const fillBracket = (bracketMatches, items) => {
    const r1 = bracketMatches.filter(m => m.round === 1);
    const slots = r1.length * 2;
    const seeded = spreadByes(items, slots);

    for (let i = 0; i < r1.length; i++) {
      const p1 = seeded[i * 2], p2 = seeded[i * 2 + 1];
      const bye = !p1 || !p2;
      r1[i].player1 = p1 ? p1.name : 'BYE';
      r1[i].player2 = p2 ? p2.name : 'BYE';
      r1[i].p1id = p1 ? p1.id : -1;
      r1[i].p2id = p2 ? p2.id : -1;
      r1[i].isBye = bye;
      r1[i].pending = false;
      if (bye) r1[i].winner = (p1 || p2)?.name || null;
    }
    advanceBracket(bracketMatches);
  };

  const upperItems = seedCross(statsA.slice(0, halfA), statsB.slice(0, halfB), halfA + halfB);
  fillBracket(upperMatches, upperItems);
  if (lowerMatches.length > 0) {
    const lowerItems = seedCross(statsA.slice(halfA), statsB.slice(halfB), (groupA.length - halfA) + (groupB.length - halfB));
    fillBracket(lowerMatches, lowerItems);
  }
}

// 단단복 조별리그 완료 → 상위/하위부 팀 bout 배치
function advanceGroupTournamentDandokdan() {
  const groupMatches = S.matches.filter(m => m.phase === 'group');
  const upperPlaceholders = S.matches.filter(m => m.phase === 'upper');

  if (upperPlaceholders.length === 0) return;

  // 조별 리그 전부 완료됐는지 확인 (voided 포함)
  const allGroupDone = groupMatches.every(m => m.winner || m.isBye || m.voided);
  if (!allGroupDone) return;

  // 상위부가 이미 배치됐으면 스킵
  const upperR1 = upperPlaceholders.filter(m => m.round === 1);
  if (upperR1.some(m => m.player1 !== '?' || m.player2 !== '?')) return;

  // 팀 bout 결과로 A/B조 팀 순위 계산
  const calcTeamGroupStats = (groupId) => {
    const gMatches = groupMatches.filter(m => m.groupId === groupId);
    const gTeams = S.teams.filter(t => t.group === groupId);
    const stats = {};
    gTeams.forEach(t => { stats[t.id] = { id: t.id, name: t.name, w: 0, l: 0, sw: 0, sl: 0, pts: 0 }; });

    // teamMatchId로 묶어서 bout 승패 계산
    const byTM = {};
    gMatches.forEach(m => {
      if (m.teamMatchId) (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m);
    });
    Object.values(byTM).forEach(bout => {
      let t1w = 0, t2w = 0;
      const m1 = bout.find(m => m.subRound === 1);
      if (!m1) return;
      const t1 = gTeams.find(t => t.p1id === m1.p1id || t.p2id === m1.p1id);
      const t2 = gTeams.find(t => t.p1id === m1.p2id || t.p2id === m1.p2id);
      if (!t1 || !t2) return;
      bout.forEach(m => {
        if (!m.winner || m.voided) return;
        if (m.winner === m.player1) t1w++; else t2w++;
      });
      if (stats[t1.id]) { stats[t1.id].sw += t1w; stats[t1.id].sl += t2w; }
      if (stats[t2.id]) { stats[t2.id].sw += t2w; stats[t2.id].sl += t1w; }
      if (t1w >= 2 && stats[t1.id]) { stats[t1.id].w++; stats[t1.id].pts += 2; }
      if (t2w >= 2 && stats[t2.id]) { stats[t2.id].w++; stats[t2.id].pts += 2; }
      if (t1w >= 2 && stats[t2.id]) stats[t2.id].l++;
      if (t2w >= 2 && stats[t1.id]) stats[t1.id].l++;
    });

    return Object.values(stats).sort((a, b) => b.pts - a.pts || b.w - a.w || (b.sw - b.sl) - (a.sw - a.sl));
  };

  const statsA = calcTeamGroupStats('A');
  const statsB = calcTeamGroupStats('B');

  const teamsA = S.teams.filter(t => t.group === 'A');
  const teamsB = S.teams.filter(t => t.group === 'B');
  const halfA = Math.ceil(teamsA.length / 2);
  const halfB = Math.ceil(teamsB.length / 2);

  // 교차 시드
  const seedCrossTeams = (stA, stB) => {
    const seeded = [];
    for (let i = 0; i < Math.max(stA.length, stB.length); i++) {
      if (stA[i]) seeded.push(S.teams.find(t => t.id === stA[i].id));
      if (stB[i]) seeded.push(S.teams.find(t => t.id === stB[i].id));
    }
    return seeded;
  };

  // 단단복 bracket: placeholder를 제거하고 실제 bout 매치로 교체
  const createBracketBouts = (seededTeams, phase) => {
    // placeholder 제거
    const phaseIdx = [];
    S.matches.forEach((m, i) => { if (m.phase === phase) phaseIdx.push(i); });
    // 역순으로 제거
    for (let i = phaseIdx.length - 1; i >= 0; i--) {
      S.matches.splice(phaseIdx[i], 1);
    }

    // 팀 수에 맞는 토너먼트 bracket 생성
    const count = seededTeams.length;
    if (count < 2) return;
    const rounds = Math.ceil(Math.log2(count));
    const slots = Math.pow(2, rounds);
    const ordered = spreadByes(seededTeams, slots);

    // Round 1: 실제 bout 매치 생성
    for (let i = 0; i < slots / 2; i++) {
      const t1 = ordered[i * 2], t2 = ordered[i * 2 + 1];
      const bye = !t1 || !t2;

      if (bye) {
        // BYE: 단일 placeholder 매치
        const winner = t1 || t2;
        S.matches.push(mkMatch({
          type: 'doubles', phase, round: 1,
          player1: t1 ? t1.name : 'BYE', player2: t2 ? t2.name : 'BYE',
          p1id: t1 ? t1.id : -1, p2id: t2 ? t2.id : -1,
          isBye: true, winner: winner ? winner.name : null,
        }));
      } else {
        // 실제 bout (3경기)
        const tmId = ++teamMatchIdSeed;
        S.matches.push(mkMatch({
          type: 'singles', phase, round: 1,
          player1: t1.p1, player2: t2.p1,
          p1id: t1.p1id, p2id: t2.p1id,
          teamMatchId: tmId, subRound: 1,
        }));
        S.matches.push(mkMatch({
          type: 'singles', phase, round: 1,
          player1: t1.p2, player2: t2.p2,
          p1id: t1.p2id, p2id: t2.p2id,
          teamMatchId: tmId, subRound: 2,
        }));
        S.matches.push(mkMatch({
          type: 'doubles', phase, round: 1,
          player1: t1.name, player2: t2.name,
          p1id: t1.id, p2id: t2.id,
          teamMatchId: tmId, subRound: 3,
        }));
      }
    }

    // Later rounds: pending placeholder (bout will be created when advancing)
    let prev = slots / 2;
    for (let r = 2; r <= rounds; r++) {
      const cnt = prev / 2;
      for (let i = 0; i < cnt; i++) {
        S.matches.push(mkMatch({
          type: 'doubles', phase, round: r,
          player1: '?', player2: '?', pending: true,
        }));
      }
      prev = cnt;
    }
  };

  const upperTeams = seedCrossTeams(statsA.slice(0, halfA), statsB.slice(0, halfB));
  const lowerTeams = seedCrossTeams(statsA.slice(halfA), statsB.slice(halfB));

  createBracketBouts(upperTeams, 'upper');
  if (lowerTeams.length >= 2) {
    createBracketBouts(lowerTeams, 'lower');
  }
}

// 단단복 bracket에서 bout 승자 결정 후 다음 라운드 bout 생성
function advanceDandokdanBracket(phase) {
  const phaseMatches = S.matches.filter(m => m.phase === phase);
  const byRound = {};
  phaseMatches.forEach(m => { (byRound[m.round] = byRound[m.round] || []).push(m); });
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  for (let ri = 0; ri < rounds.length - 1; ri++) {
    const curRound = rounds[ri];
    const nxtRound = rounds[ri + 1];
    const curMatches = byRound[curRound];
    const nxtMatches = byRound[nxtRound];

    // 현재 라운드의 bout들을 teamMatchId로 묶기 (BYE는 개별)
    const byTM = {};
    const byeMatches = [];
    curMatches.forEach(m => {
      if (m.teamMatchId) {
        (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m);
      } else if (m.isBye) {
        byeMatches.push(m);
      }
    });

    // 각 bout/bye의 순서를 match id 순으로 정렬
    const boutEntries = [];
    Object.values(byTM).forEach(bout => {
      const minId = Math.min(...bout.map(m => m.id));
      let t1w = 0, t2w = 0;
      const m1 = bout.find(m => m.subRound === 1);
      const t1 = S.teams.find(t => t.p1id === m1.p1id || t.p2id === m1.p1id);
      const t2 = S.teams.find(t => t.p1id === m1.p2id || t.p2id === m1.p2id);
      bout.forEach(m => {
        if (!m.winner || m.voided) return;
        if (m.winner === m.player1) t1w++; else t2w++;
      });
      const winner = t1w >= 2 ? t1 : t2w >= 2 ? t2 : null;
      boutEntries.push({ minId, winner });
    });
    byeMatches.forEach(m => {
      const winnerName = m.winner;
      const team = S.teams.find(t => t.name === winnerName);
      boutEntries.push({ minId: m.id, winner: team || null });
    });
    boutEntries.sort((a, b) => a.minId - b.minId);

    // 다음 라운드의 pending placeholder를 bout으로 교체
    for (let j = 0; j < boutEntries.length; j += 2) {
      const w1 = boutEntries[j]?.winner;
      const w2 = boutEntries[j + 1]?.winner;
      const nxtIdx = Math.floor(j / 2);

      if (!w1 && !w2) continue;
      if (nxtIdx >= nxtMatches.length) continue;

      const placeholder = nxtMatches[nxtIdx];
      if (!placeholder.pending) continue;

      // 두 승자가 모두 결정되면 bout 생성
      if (w1 && w2) {
        // placeholder를 제거하고 bout 매치 삽입
        const placeholderIdx = S.matches.indexOf(placeholder);
        S.matches.splice(placeholderIdx, 1);

        const tmId = ++teamMatchIdSeed;
        const newMatches = [
          mkMatch({
            type: 'singles', phase, round: nxtRound,
            player1: w1.p1, player2: w2.p1,
            p1id: w1.p1id, p2id: w2.p1id,
            teamMatchId: tmId, subRound: 1,
          }),
          mkMatch({
            type: 'singles', phase, round: nxtRound,
            player1: w1.p2, player2: w2.p2,
            p1id: w1.p2id, p2id: w2.p2id,
            teamMatchId: tmId, subRound: 2,
          }),
          mkMatch({
            type: 'doubles', phase, round: nxtRound,
            player1: w1.name, player2: w2.name,
            p1id: w1.id, p2id: w2.id,
            teamMatchId: tmId, subRound: 3,
          }),
        ];
        S.matches.splice(placeholderIdx, 0, ...newMatches);
      } else if (w1) {
        placeholder.player1 = w1.name;
        placeholder.p1id = w1.id;
      } else if (w2) {
        placeholder.player2 = w2.name;
        placeholder.p2id = w2.id;
      }
    }
  }
}

// 특정 phase bracket에 대한 advance (advanceTournament의 phase 버전)
function advanceBracket(bracketMatches) {
  const byRound = {};
  bracketMatches.forEach(m => {
    (byRound[m.round] = byRound[m.round] || []).push(m);
  });
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < rounds.length - 1; i++) {
    const cur = byRound[rounds[i]];
    const nxt = byRound[rounds[i + 1]];
    for (let j = 0; j < cur.length; j += 2) {
      const m1 = cur[j], m2 = cur[j + 1];
      const nm = nxt[Math.floor(j / 2)];
      if (!nm) continue;
      if (m1?.winner) { nm.player1 = m1.winner; nm.p1id = m1.winner === m1.player1 ? m1.p1id : m1.p2id; }
      if (m2?.winner) { nm.player2 = m2.winner; nm.p2id = m2.winner === m2.player1 ? m2.p1id : m2.p2id; }
      if (nm.player1 !== '?' && nm.player2 !== '?') nm.pending = false;
    }
  }
}
