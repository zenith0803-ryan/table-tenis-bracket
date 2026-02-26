// ================================================================
// MATCH HELPERS
// ================================================================
function mkMatch(o) {
  return {
    id: ++matchIdSeed,
    type: 'singles', phase: 'roundrobin', round: 1,
    player1: '', player2: '', p1id: null, p2id: null,
    winner: null, score1: 0, score2: 0, sets: [],
    isBye: false, pending: false, referee: null,
    teamMatchId: null, subRound: null, voided: false, groupId: null,
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

// ================================================================
// SCORING & HANDICAP
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

// 핸디캡 계산 (단식 경기만 적용, 부수 미설정 시 null 반환)
// 규칙: 1부 차이 = 2점, 최대 6점 / 높은 부수 번호 = 약한 선수
function calcHandicap(match) {
  if (match.type === 'doubles') return null;
  const p1 = S.players.find(p => p.id === match.p1id);
  const p2 = S.players.find(p => p.id === match.p2id);
  if (!p1?.buso || !p2?.buso || p1.buso === p2.buso) return null;
  const diff = Math.abs(p1.buso - p2.buso);
  const pts = Math.min(diff * 2, 6);
  const weakerName = p1.buso > p2.buso ? match.player1 : match.player2;
  return { player: weakerName, pts };
}

// 승점/승패 통계 계산 (렌더링과 분리)
function buildStats(items, matches) {
  const stats = {};
  items.forEach(p => { stats[p.name] = { name: p.name, buso: p.buso || null, w: 0, l: 0, sw: 0, sl: 0, pts: 0 }; });

  matches
    .filter(m => m.winner && !m.isBye && (m.phase === 'roundrobin' || m.phase === 'singles' || m.phase === 'tournament' || m.phase === 'group'))
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
