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
  gameType:    { singles: '단식', doubles: '복식', jjampong: '혼합 릴레이' },
  format:      { bo3: '3판2승', bo5: '5판3승' },
  mode:        { roundrobin: '리그전', tournament: '토너먼트' },
  doublesMode: { auto: '자동 매칭', manual: '직접 구성' },
};

// ================================================================
// API
// ================================================================
async function apiCreate() {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: S }),
  });
  return (await res.json()).code;
}

async function apiGet(code) {
  const res = await fetch(`/api/rooms/${code}`);
  if (!res.ok) return null;
  return res.json();
}

function apiSave(code, state) {
  fetch(`/api/rooms/${code}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  }).catch(() => {});
}

// ================================================================
// POLLING
// ================================================================
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (!roomCode || S.modalMatchId !== null) return;
    const room = await apiGet(roomCode);
    if (!room) return;
    if (JSON.stringify(room.state) !== JSON.stringify(S)) {
      Object.assign(S, room.state);
      render();
    }
  }, 5000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

// ================================================================
// MATCH GENERATION HELPERS
// ================================================================
function mkMatch(o) {
  return {
    id: ++matchIdSeed,
    type: 'singles', phase: 'roundrobin', round: 1,
    player1: '', player2: '', p1id: null, p2id: null,
    winner: null, score1: 0, score2: 0, sets: [],
    isBye: false, pending: false, referee: null,
    ...o,
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

function genTournament(players, type = 'singles') {
  const shuffled = shuffle(players);
  const rounds = Math.ceil(Math.log2(shuffled.length));
  const slots = Math.pow(2, rounds);
  const seeded = [...shuffled];
  while (seeded.length < slots) seeded.push(null);

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
// SCORING
// ================================================================
function winsNeeded() {
  return S.settings.scoringFormat === 'bo5' ? 3 : 2;
}

function countSets(sets) {
  let s1 = 0, s2 = 0;
  sets.forEach(([a, b]) => {
    const ia = parseInt(a) || 0, ib = parseInt(b) || 0;
    if (ia > ib) s1++; else if (ib > ia) s2++;
  });
  return { s1, s2 };
}

// 승점/승패 통계 계산 (렌더링과 분리)
function buildStats(items, matches) {
  const stats = {};
  items.forEach(p => { stats[p.name] = { name: p.name, w: 0, l: 0, sw: 0, sl: 0, pts: 0 }; });

  matches
    .filter(m => m.winner && !m.isBye && (m.phase === 'roundrobin' || m.phase === 'singles'))
    .forEach(m => {
      if (!stats[m.player1] || !stats[m.player2]) return;
      const win = m.winner, lose = win === m.player1 ? m.player2 : m.player1;
      const ws = Math.max(m.score1, m.score2), ls = Math.min(m.score1, m.score2);
      stats[win].w++;  stats[win].pts += 2; stats[win].sw += ws; stats[win].sl += ls;
      stats[lose].l++; stats[lose].sw += ls; stats[lose].sl += ws;
    });

  return Object.values(stats).sort((a, b) => b.pts - a.pts || b.w - a.w || (b.sw - b.sl) - (a.sw - a.sl));
}

// ================================================================
// DOM HELPERS
// ================================================================
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'cls') el.className = v;
    else if (k.startsWith('on')) el[k] = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  });
  children.flat(Infinity).forEach(c => {
    if (c == null) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}

const d  = (cls, ...children) => h('div', { cls }, ...children);
const s  = (cls, text) => h('span', { cls }, text);
const cx = (...cls) => cls.filter(Boolean).join(' ');

// ================================================================
// RENDER DISPATCHER
// ================================================================
const app = document.getElementById('app');

function render() {
  app.innerHTML = '';
  if (S.screen === 'setup') renderSetup();
  else if (S.screen === 'players') renderPlayers();
  else renderMain();
}

// ================================================================
// SETUP SCREEN
// ================================================================
function renderSetupHome(onNew) {
  app.innerHTML = '';
  const codeInput = h('input', { type: 'text', placeholder: '방 코드 입력 (예: ABF3K7)', style: 'text-transform:uppercase;letter-spacing:2px' });

  app.appendChild(d('header', h('h1', {}, '🏓 탁구 대진표')));
  app.appendChild(d('content',
    d('hero',
      d('hero-icon', '🏓'),
      d('hero-title', '탁구 대진표'),
      d('hero-sub', '친구들과 함께하는 탁구 대회'),
    ),
    h('button', { cls: 'btn btn-primary', onclick: onNew }, '새 대회 만들기'),
    d('or-row', '또는 방 코드로 참가'),
    d('join-row',
      codeInput,
      h('button', {
        cls: 'btn btn-secondary btn-sm',
        onclick: async () => {
          const code = codeInput.value.trim().toUpperCase();
          if (code.length !== 6) { alert('6자리 방 코드를 입력하세요'); return; }
          const room = await apiGet(code);
          if (!room) { alert('방을 찾을 수 없습니다.\n서버가 재시작되었을 수 있습니다.'); return; }
          roomCode = code;
          Object.assign(S, room.state);
          history.replaceState(null, '', `?room=${code}`);
          startPolling();
          render();
        }
      }, '참가'),
    ),
  ));
}

function renderSetupNew(tmp, onBack) {
  const draw = () => {
    app.innerHTML = '';
    app.appendChild(d('header', h('h1', {}, '🏓 탁구 대진표')));

    const optGroup = (options, key) =>
      d('option-group', ...options.map(({ value, label }) => {
        const b = h('div', { cls: cx('opt-btn', tmp[key] === value && 'active') }, label);
        b.onclick = () => { tmp[key] = value; draw(); };
        return b;
      }));

    const countSel = h('select', { onchange: e => { tmp.playerCount = parseInt(e.target.value); } },
      ...[...Array(15)].map((_, i) => {
        const n = i + 2;
        const o = h('option', { value: n }, `${n}명`);
        if (tmp.playerCount === n) o.selected = true;
        return o;
      })
    );

    const fields = [
      d('form-group', h('label', {}, '종목'), optGroup([
        { value: 'singles',  label: LABEL.gameType.singles },
        { value: 'doubles',  label: LABEL.gameType.doubles },
        { value: 'jjampong', label: LABEL.gameType.jjampong },
      ], 'gameType')),
      d('form-group', h('label', {}, '득점 방식'), optGroup([
        { value: 'bo3', label: LABEL.format.bo3 },
        { value: 'bo5', label: LABEL.format.bo5 },
      ], 'scoringFormat')),
    ];

    if (tmp.gameType !== 'jjampong') {
      fields.push(d('form-group', h('label', {}, '경기 방식'), optGroup([
        { value: 'roundrobin', label: LABEL.mode.roundrobin },
        { value: 'tournament', label: LABEL.mode.tournament },
      ], 'tournamentType')));
    }
    if (tmp.gameType === 'doubles') {
      fields.push(d('form-group', h('label', {}, '팀 구성'), optGroup([
        { value: 'auto',   label: LABEL.doublesMode.auto },
        { value: 'manual', label: LABEL.doublesMode.manual },
      ], 'doublesMode')));
    }
    fields.push(d('form-group', h('label', {}, '참가 인원'), countSel));

    app.appendChild(d('content',
      d('row',
        h('button', { cls: 'btn btn-secondary btn-sm', style: 'width:auto', onclick: onBack }, '← 뒤로'),
        h('h2', { style: 'font-size:15px;font-weight:700;line-height:37px' }, '새 대회 설정'),
      ),
      h('div', { style: 'height:12px' }),
      ...fields,
      h('button', {
        cls: 'btn btn-primary',
        onclick: () => {
          S.settings = { ...tmp };
          S.players = Array.from({ length: tmp.playerCount }, (_, i) => ({ id: i + 1, name: `선수${i + 1}` }));
          S.teams = []; S.matches = []; S.screen = 'players';
          render();
        }
      }, '다음 → 선수 등록'),
    ));
  };
  draw();
}

function renderSetup() {
  const tmp = { ...S.settings };
  const goHome = () => renderSetupHome(goNew);
  const goNew  = () => renderSetupNew(tmp, goHome);
  goHome();
}

// ================================================================
// PLAYERS SCREEN
// ================================================================
function renderPlayers() {
  const players = S.players.map(p => ({ ...p }));
  const { gameType, doublesMode, playerCount } = S.settings;
  let teams = S.teams.length > 0 ? S.teams.map(t => ({ ...t })) :
    (gameType === 'doubles' && doublesMode === 'manual')
      ? Array.from({ length: Math.floor(playerCount / 2) }, (_, i) => ({ id: i + 1, p1id: null, p2id: null, p1: '', p2: '', name: '' }))
      : [];

  const draw = () => {
    app.innerHTML = '';
    app.appendChild(d('header', h('h1', {}, '선수 등록')));

    const playerInputs = players.map((p, i) => {
      const inp = h('input', { type: 'text', value: p.name, placeholder: `선수 ${i + 1}` });
      inp.oninput = e => { players[i].name = e.target.value || `선수${i + 1}`; };
      return d('player-row', s('player-num', `${i + 1}.`), inp);
    });

    let teamSection = null;
    if (gameType === 'doubles' && doublesMode === 'manual') {
      const mkSel = (selectedId, onChange) =>
        h('select', { onchange: e => onChange(parseInt(e.target.value) || null) },
          h('option', { value: '' }, '선수 선택'),
          ...players.map(p => {
            const o = h('option', { value: p.id }, p.name);
            if (p.id === selectedId) o.selected = true;
            return o;
          })
        );

      const cards = teams.map((team, ti) => d('team-card',
        h('h4', {}, `팀 ${ti + 1}`),
        d('team-selects',
          mkSel(team.p1id, id => {
            teams[ti].p1id = id;
            teams[ti].p1 = players.find(p => p.id === id)?.name || '';
            teams[ti].name = `${teams[ti].p1} / ${teams[ti].p2}`;
          }),
          s('', ' / '),
          mkSel(team.p2id, id => {
            teams[ti].p2id = id;
            teams[ti].p2 = players.find(p => p.id === id)?.name || '';
            teams[ti].name = `${teams[ti].p1} / ${teams[ti].p2}`;
          }),
        )
      ));
      teamSection = h('div', { style: 'margin-top:16px' }, h('label', {}, '팀 구성'), ...cards);
    }

    app.appendChild(d('content',
      ...playerInputs,
      teamSection,
      h('div', { style: 'height:16px' }),
      d('row',
        h('button', { cls: 'btn btn-secondary', onclick: () => { S.screen = 'setup'; render(); } }, '← 뒤로'),
        h('button', {
          cls: 'btn btn-primary',
          onclick: async () => {
            S.players = players;
            matchIdSeed = 0;
            const { gameType: gt, tournamentType, doublesMode: dm } = S.settings;

            if (gt === 'doubles' && S.players.length % 2 !== 0) {
              alert(`복식은 짝수 인원만 가능합니다.\n현재 ${S.players.length}명 → ${S.players.length + 1}명 또는 ${S.players.length - 1}명으로 변경해주세요.`);
              return;
            }

            if (gt === 'singles') {
              S.matches = tournamentType === 'roundrobin' ? genRoundRobin(S.players) : genTournament(S.players);
            } else if (gt === 'doubles') {
              const r = genDoubles(S.players, dm, tournamentType, dm === 'manual' ? teams : []);
              S.teams = r.teams; S.matches = r.matches;
            } else {
              S.matches = genJjampong(S.players);
            }

            S.screen = 'main'; S.tab = 'matches';
            const code = await apiCreate();
            roomCode = code;
            history.replaceState(null, '', `?room=${code}`);
            startPolling();
            render();
          }
        }, '대진표 생성 →'),
      ),
    ));
  };

  draw();
}

// ================================================================
// MAIN SCREEN
// ================================================================
function renderMain() {
  app.innerHTML = '';

  // Header
  const shareBtn = h('button', {
    cls: 'icon-btn',
    onclick: () => {
      const url = location.href;
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => alert('링크 복사됨!'));
      else prompt('링크를 복사하세요:', url);
    }
  }, '🔗');

  app.appendChild(d('header',
    h('h1', {}, '🏓 탁구 대진표'),
    d('header-right', roomCode ? s('room-chip', roomCode) : null, shareBtn),
  ));

  // Tabs
  const tabDefs = [['matches', '경기'], ['bracket', '대진표'], ['info', '정보']];
  app.appendChild(d('tabs', ...tabDefs.map(([key, label]) => {
    const t = h('div', { cls: cx('tab', S.tab === key && 'active') }, label);
    t.onclick = () => { S.tab = key; renderMain(); };
    return t;
  })));

  // Tab content
  if (S.tab === 'matches') app.appendChild(renderMatchesTab());
  else if (S.tab === 'bracket') app.appendChild(renderBracketTab());
  else app.appendChild(renderInfoTab());

  // Modal
  if (S.modalMatchId !== null) app.appendChild(renderModal());
}

// ================================================================
// MATCHES TAB
// ================================================================
function roundLabel(phase, round, totalInRound) {
  if (phase === 'singles') return `단식 ${round}라운드`;
  if (phase === 'doubles') return `복식 ${round}라운드`;
  if (phase === 'roundrobin') return `${round}라운드`;
  if (phase === 'tournament') {
    if (totalInRound === 1) return '결승';
    if (totalInRound === 2) return '준결승';
    if (totalInRound === 4) return '8강';
    return `토너먼트 ${round}라운드`;
  }
  return `${round}라운드`;
}

function renderMatchesTab() {
  const content = d('content');

  // Winner banner for single-elim
  if (S.settings.tournamentType === 'tournament' && S.settings.gameType !== 'jjampong') {
    const lastRound = Math.max(...S.matches.filter(m => m.phase === 'tournament').map(m => m.round));
    const final = S.matches.find(m => m.phase === 'tournament' && m.round === lastRound);
    if (final?.winner && final.winner !== '?') {
      content.appendChild(d('winner-banner',
        d('trophy', '🏆'), d('wname', final.winner), d('wlabel', '우승')
      ));
    }
  }

  // Group by phase+round
  const groups = {};
  S.matches.forEach(m => {
    const key = `${m.phase}__${m.round}`;
    if (!groups[key]) groups[key] = { phase: m.phase, round: m.round, list: [] };
    groups[key].list.push(m);
  });

  const phaseOrder = { singles: 0, roundrobin: 0, tournament: 1, doubles: 2 };
  Object.keys(groups).sort((a, b) => {
    const ga = groups[a], gb = groups[b];
    return (phaseOrder[ga.phase] || 0) - (phaseOrder[gb.phase] || 0) || ga.round - gb.round;
  }).forEach(key => {
    const { phase, round, list } = groups[key];
    content.appendChild(d('round-label', roundLabel(phase, round, list.length)));
    list.forEach(m => content.appendChild(matchCard(m)));
  });

  return content;
}

function matchCard(m) {
  const done = !!m.winner;
  const card = h('div', { cls: cx('match-card', done && !m.isBye && 'done', m.isBye && 'bye', m.pending && 'pending') });

  if (m.isBye) {
    const winner = m.player1 === 'BYE' ? m.player2 : m.player1;
    card.appendChild(d('match-players',
      h('div', { cls: 'mp' }, winner),
      s('match-vs', '부전승'),
      h('div', { cls: 'mp right', style: 'color:#ccc' }, 'BYE'),
    ));
    return card;
  }

  if (m.pending) {
    card.appendChild(d('match-players',
      h('div', { cls: 'mp', style: 'color:#ccc' }, '?'),
      s('match-vs', 'vs'),
      h('div', { cls: 'mp right', style: 'color:#ccc' }, '?'),
    ));
    return card;
  }

  card.appendChild(d('match-players',
    h('div', { cls: cx('mp', m.winner === m.player1 && 'winner') }, m.player1),
    s('match-vs', done ? `${m.score1}-${m.score2}` : 'vs'),
    h('div', { cls: cx('mp right', m.winner === m.player2 && 'winner') }, m.player2),
  ));

  if (m.referee) {
    card.appendChild(d('ref-note', '심판:', h('span', { cls: 'ref-badge' }, m.referee)));
  }

  if (m.sets?.length > 0) {
    const setsEl = d('match-sets');
    m.sets.forEach(([a, b]) => {
      const p1wins = (parseInt(a) || 0) > (parseInt(b) || 0);
      setsEl.appendChild(s(cx('set-pill', p1wins && 'w'), `${a}-${b}`));
    });
    card.appendChild(setsEl);
  }

  card.onclick = () => {
    S.modalMatchId = m.id;
    stopPolling();
    renderMain();
  };

  return card;
}

// ================================================================
// BRACKET TAB
// ================================================================
function renderBracketTab() {
  const content = d('content');
  const { gameType, tournamentType } = S.settings;

  if (gameType === 'jjampong') {
    content.appendChild(h('div', { style: 'font-size:13px;font-weight:700;color:#888;margin-bottom:8px' }, '단식 순위'));
    content.appendChild(renderStandings('singles'));

    const dMatches = S.matches.filter(m => m.phase === 'doubles' && m.winner);
    if (dMatches.length > 0) {
      content.appendChild(h('div', { style: 'font-size:13px;font-weight:700;color:#888;margin:16px 0 8px' }, '복식 결과'));
      const grouped = {};
      dMatches.forEach(m => { (grouped[m.round] = grouped[m.round] || []).push(m); });
      Object.keys(grouped).sort((a, b) => a - b).forEach(r => {
        content.appendChild(d('round-label', `복식 ${r}라운드`));
        grouped[r].forEach(m => content.appendChild(matchCard(m)));
      });
    }
    return content;
  }

  if (tournamentType === 'tournament') {
    const tournMatches = S.matches.filter(m => m.phase === 'tournament');
    const maxRound = Math.max(...tournMatches.map(m => m.round));
    const wrap = d('bracket-wrap');
    const rounds = d('bracket-rounds');

    for (let r = 1; r <= maxRound; r++) {
      const rm = tournMatches.filter(m => m.round === r);
      const col = d('bracket-col');
      col.appendChild(d('bracket-col-label', roundLabel('tournament', r, rm.length)));
      rm.forEach(m => {
        const isBye  = v => v === 'BYE' || v === '?';
        const bm = h('div', { cls: cx('bracket-match', m.winner && 'done') });
        bm.appendChild(h('div', { cls: cx('bp', isBye(m.player1) && 'bye', m.winner === m.player1 && 'winner') }, m.player1 || '?'));
        bm.appendChild(h('hr', { cls: 'bdivider' }));
        bm.appendChild(h('div', { cls: cx('bp', isBye(m.player2) && 'bye', m.winner === m.player2 && 'winner') }, m.player2 || '?'));
        col.appendChild(bm);
      });
      rounds.appendChild(col);
    }
    wrap.appendChild(rounds);
    content.appendChild(wrap);
  } else {
    content.appendChild(renderStandings());
  }

  return content;
}

function renderStandings(forceType) {
  const gameType = forceType || S.settings.gameType;
  const items = gameType === 'doubles'
    ? S.teams.map(t => ({ id: t.id, name: t.name }))
    : S.players;

  const sorted = buildStats(items, S.matches);

  return h('table', { cls: 'standings-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, '#'), h('th', {}, '이름'), h('th', {}, '승점'), h('th', {}, '승'), h('th', {}, '패'), h('th', {}, '세트'),
    )),
    h('tbody', {}, ...sorted.map((p, i) => h('tr', {},
      h('td', { cls: 'rank' }, `${i + 1}`),
      h('td', {}, p.name),
      h('td', { style: 'font-weight:700;color:#e74c3c' }, `${p.pts}`),
      h('td', {}, `${p.w}`),
      h('td', {}, `${p.l}`),
      h('td', {}, `${p.sw}-${p.sl}`),
    ))),
  );
}

// ================================================================
// INFO TAB
// ================================================================
function renderInfoTab() {
  const content = d('content');
  const { gameType, scoringFormat, tournamentType } = S.settings;
  const total = S.matches.filter(m => !m.isBye && !m.pending).length;
  const done  = S.matches.filter(m => m.winner && !m.isBye).length;

  if (roomCode) {
    content.appendChild(h('div', {},
      h('label', {}, '방 코드'),
      d('room-code-big', roomCode),
      h('p', { style: 'text-align:center;font-size:12px;color:#aaa;margin-bottom:16px' }, 'URL 또는 이 코드로 참가할 수 있습니다'),
    ));
  }

  const modeLabel = gameType === 'jjampong'
    ? LABEL.gameType.jjampong
    : LABEL.mode[tournamentType];

  content.appendChild(d('info-box',
    h('h3', {}, '대회 정보'),
    d('info-row', h('span', {}, '종목'),  s('info-val', LABEL.gameType[gameType])),
    d('info-row', h('span', {}, '득점'),  s('info-val', LABEL.format[scoringFormat])),
    d('info-row', h('span', {}, '방식'),  s('info-val', modeLabel)),
    d('info-row', h('span', {}, '참가자'), s('info-val', `${S.players.length}명`)),
    d('info-row', h('span', {}, '진행'),  s('info-val', `${done} / ${total} 경기`)),
  ));

  content.appendChild(d('info-box',
    h('h3', {}, '참가자'),
    ...S.players.map((p, i) => d('info-row', h('span', {}, `${i + 1}. ${p.name}`))),
  ));

  return content;
}

// ================================================================
// SCORE MODAL
// ================================================================
function renderModal() {
  const match = S.matches.find(m => m.id === S.modalMatchId);
  if (!match) return null;

  const maxSets = S.settings.scoringFormat === 'bo5' ? 5 : 3;
  const needed = winsNeeded();
  let sets = match.sets.length > 0 ? match.sets.map(s => [...s]) : [['', '']];

  const overlay = d('overlay');

  const draw = () => {
    overlay.innerHTML = '';
    const modal = d('modal');

    modal.appendChild(d('modal-title', '점수 입력'));
    modal.appendChild(d('modal-players',
      h('span', {}, match.player1),
      s('modal-vs', 'vs'),
      h('span', {}, match.player2),
    ));

    // Set rows
    sets.forEach((set, i) => {
      const in1 = h('input', { type: 'number', cls: 'set-input', value: set[0], min: '0' });
      const in2 = h('input', { type: 'number', cls: 'set-input', value: set[1], min: '0' });
      in1.oninput = e => { sets[i][0] = e.target.value; };
      in2.oninput = e => { sets[i][1] = e.target.value; };

      const row = d('set-row', s('set-label', `${i + 1}세트`), in1, s('', ' - '), in2);
      if (i === sets.length - 1 && sets.length > 1) {
        row.appendChild(h('button', { cls: 'set-rm', onclick: () => { sets.pop(); draw(); } }, '✕'));
      }
      modal.appendChild(row);
    });

    // Score summary
    const { s1, s2 } = countSets(sets.filter(([a, b]) => a !== '' || b !== ''));
    modal.appendChild(d('score-display', `${s1} - ${s2}`));

    // Add set button
    if (s1 < needed && s2 < needed && sets.length < maxSets) {
      modal.appendChild(h('button', {
        cls: 'btn btn-secondary', style: 'margin-bottom:8px',
        onclick: () => { sets.push(['', '']); draw(); }
      }, '+ 세트 추가'));
    }

    // Actions
    modal.appendChild(d('modal-actions',
      h('button', {
        cls: 'btn btn-secondary',
        onclick: () => { S.modalMatchId = null; startPolling(); renderMain(); }
      }, '취소'),
      h('button', {
        cls: 'btn btn-primary',
        onclick: () => {
          const filled = sets.filter(([a, b]) => a !== '' && b !== '');
          if (!filled.length) { alert('최소 1세트를 입력하세요'); return; }
          const { s1, s2 } = countSets(filled);
          let winner = null;
          if (s1 >= needed) winner = match.player1;
          else if (s2 >= needed) winner = match.player2;
          if (!winner) { alert(`${needed}세트를 먼저 이겨야 완료됩니다`); return; }

          const idx = S.matches.findIndex(m => m.id === S.modalMatchId);
          S.matches[idx] = { ...match, sets: filled, score1: s1, score2: s2, winner };

          if (match.phase === 'tournament') advanceTournament(S.matches);

          S.modalMatchId = null;
          if (roomCode) apiSave(roomCode, S);
          startPolling();
          renderMain();
        }
      }, '저장'),
    ));

    overlay.appendChild(modal);
  };

  draw();

  overlay.onclick = e => {
    if (e.target === overlay) { S.modalMatchId = null; startPolling(); renderMain(); }
  };

  return overlay;
}

// ================================================================
// INIT
// ================================================================
window.onload = async () => {
  const code = new URLSearchParams(location.search).get('room');
  if (code) {
    const room = await apiGet(code);
    if (room) {
      roomCode = code;
      Object.assign(S, room.state);
      startPolling();
    } else {
      alert('방을 찾을 수 없습니다.\n서버가 재시작되었을 수 있습니다.');
      history.replaceState(null, '', '/');
    }
  }
  render();
};
