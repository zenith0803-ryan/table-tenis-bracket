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
function genGroupTournament(players) {
  // Snake draft: 부수 있으면 부수 오름차순(강→약), 없으면 랜덤
  const hasBuso = players.some(p => p.buso);
  const sorted = hasBuso
    ? [...players].sort((a, b) => (a.buso || 99) - (b.buso || 99))
    : shuffle(players);

  // A/B조 배정 (snake: 1→A, 2→B, 3→B, 4→A, 5→A, 6→B ...)
  sorted.forEach((p, i) => {
    const row = Math.floor(i / 2);
    p.group = (row % 2 === 0) ? (i % 2 === 0 ? 'A' : 'B') : (i % 2 === 0 ? 'B' : 'A');
  });

  const groupA = players.filter(p => p.group === 'A');
  const groupB = players.filter(p => p.group === 'B');

  // 조별 리그
  const matchesA = genRoundRobin(groupA, 'singles');
  matchesA.forEach(m => { m.phase = 'group'; m.groupId = 'A'; });
  const matchesB = genRoundRobin(groupB, 'singles');
  matchesB.forEach(m => { m.phase = 'group'; m.groupId = 'B'; });

  // 상위/하위부 토너먼트 빈 bracket (조 리그 끝난 후 배치)
  const halfA = Math.ceil(groupA.length / 2);
  const halfB = Math.ceil(groupB.length / 2);
  const upperCount = halfA + halfB;
  const lowerCount = (groupA.length - halfA) + (groupB.length - halfB);

  const upperMatches = genEmptyBracket(upperCount, 'upper');
  const lowerMatches = genEmptyBracket(lowerCount, 'lower');

  return [...matchesA, ...matchesB, ...upperMatches, ...lowerMatches];
}

// 빈 토너먼트 bracket 생성 (선수 미정)
function genEmptyBracket(count, phase) {
  if (count < 2) return [];
  const rounds = Math.ceil(Math.log2(count));
  const slots = Math.pow(2, rounds);
  const matches = [];

  // Round 1
  for (let i = 0; i < slots / 2; i++) {
    matches.push(mkMatch({
      type: 'singles', phase, round: 1,
      player1: '?', player2: '?', pending: true,
    }));
  }
  // Later rounds
  let prev = slots / 2;
  for (let r = 2; r <= rounds; r++) {
    const cnt = prev / 2;
    for (let i = 0; i < cnt; i++) {
      matches.push(mkMatch({ type: 'singles', phase, round: r, player1: '?', player2: '?', pending: true }));
    }
    prev = cnt;
  }
  return matches;
}

// 조별 리그 완료 → 상위/하위부 자동 배치
function advanceGroupTournament() {
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

  // A/B조 순위 계산
  const groupA = S.players.filter(p => p.group === 'A');
  const groupB = S.players.filter(p => p.group === 'B');
  const statsA = buildStats(groupA, groupMatches.filter(m => m.groupId === 'A'));
  const statsB = buildStats(groupB, groupMatches.filter(m => m.groupId === 'B'));

  const halfA = Math.ceil(groupA.length / 2);
  const halfB = Math.ceil(groupB.length / 2);

  const upperPlayers = [
    ...statsA.slice(0, halfA).map(s => S.players.find(p => p.name === s.name)),
    ...statsB.slice(0, halfB).map(s => S.players.find(p => p.name === s.name)),
  ].filter(Boolean);
  const lowerPlayers = [
    ...statsA.slice(halfA).map(s => S.players.find(p => p.name === s.name)),
    ...statsB.slice(halfB).map(s => S.players.find(p => p.name === s.name)),
  ].filter(Boolean);

  // 교차 시드: A조1 vs B조2, B조1 vs A조2 ...
  const seedCross = (stA, stB, count) => {
    const seeded = [];
    const aTop = stA.slice(0, Math.ceil(count / 2));
    const bTop = stB.slice(0, Math.ceil(count / 2));
    for (let i = 0; i < Math.max(aTop.length, bTop.length); i++) {
      if (aTop[i]) seeded.push(S.players.find(p => p.name === aTop[i].name));
      if (bTop[i]) seeded.push(S.players.find(p => p.name === bTop[i].name));
    }
    return seeded;
  };

  const fillBracket = (bracketMatches, players) => {
    const r1 = bracketMatches.filter(m => m.round === 1);
    const slots = r1.length * 2;
    const seeded = spreadByes(players, slots);

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
    // advance byes
    advanceBracket(bracketMatches);
  };

  fillBracket(upperMatches, seedCross(statsA.slice(0, halfA), statsB.slice(0, halfB), upperPlayers.length));
  if (lowerMatches.length > 0) {
    fillBracket(lowerMatches, seedCross(statsA.slice(halfA), statsB.slice(halfB), lowerPlayers.length));
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
