// ================================================================
// MAIN SCREEN
// ================================================================
function renderMain() {
  app.innerHTML = '';

  // Header
  const homeBtn = h('button', {
    cls: 'icon-btn',
    onclick: () => {
      if (!confirm('홈으로 나가시겠습니까?\n(탁구대진코드로 다시 참가할 수 있습니다)')) return;
      stopPolling();
      roomCode = null;
      S.screen = 'setup';
      S.modalMatchId = null;
      history.replaceState(null, '', '/');
      render();
    }
  }, '🏠');

  const shareBtn = h('button', {
    cls: 'icon-btn',
    onclick: () => {
      const url = location.href;
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => alert('링크 복사됨!'));
      else prompt('링크를 복사하세요:', url);
    }
  }, '🔗');

  const qrBtn = h('button', {
    cls: 'icon-btn',
    onclick: () => {
      const overlay = document.createElement('div');
      overlay.className = 'overlay qr-overlay';
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      const modal = document.createElement('div');
      modal.className = 'modal qr-modal';
      modal.innerHTML = '<div class="modal-title">QR 코드</div>';
      const qrBox = document.createElement('div');
      qrBox.className = 'qr-box';
      modal.appendChild(qrBox);
      new QRCode(qrBox, {
        text: location.href,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      const closeBtn = h('button', { cls: 'btn', onclick: () => overlay.remove() }, '닫기');
      const actionWrap = document.createElement('div');
      actionWrap.className = 'modal-actions';
      actionWrap.appendChild(closeBtn);
      modal.appendChild(actionWrap);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }
  }, '📱');

  app.appendChild(d('header',
    homeBtn,
    h('h1', {}, '🏓 탁구매치'),
    d('header-right', roomCode ? s('room-chip', roomCode) : null, shareBtn, qrBtn),
  ));

  // Tabs
  const tabDefs = [['matches', '경기'], ['bracket', '대진표'], ['dashboard', '종합 현황판'], ['info', '정보']];
  app.appendChild(d('tabs', ...tabDefs.map(([key, label]) => {
    const t = h('div', { cls: cx('tab', S.tab === key && 'active') }, label);
    t.onclick = () => { S.tab = key; renderMain(); };
    return t;
  })));

  // Tab content
  if (S.tab === 'matches') app.appendChild(renderMatchesTab());
  else if (S.tab === 'bracket') app.appendChild(renderBracketTab());
  else if (S.tab === 'dashboard') app.appendChild(renderDashboardTab());
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
  if (S.settings.tournamentType === 'tournament' && S.settings.gameType !== 'jjampong' && S.settings.gameType !== 'dandokdan') {
    const lastRound = Math.max(...S.matches.filter(m => m.phase === 'tournament').map(m => m.round));
    const final = S.matches.find(m => m.phase === 'tournament' && m.round === lastRound);
    if (final?.winner && final.winner !== '?') {
      content.appendChild(d('winner-banner',
        d('trophy', '🏆'), d('wname', final.winner), d('wlabel', '우승')
      ));
    }
  }

  // 조별 리그 + 상위/하위부
  if (S.settings.tournamentType === 'group') {
    const isDandokdan = S.settings.gameType === 'dandokdan';

    // 상위부 우승자 배너
    const upperMatches = S.matches.filter(m => m.phase === 'upper');
    if (upperMatches.length > 0) {
      if (isDandokdan) {
        // 단단복: bout 승자로 우승 확인
        const maxR = Math.max(...upperMatches.map(m => m.round));
        const finalMatches = upperMatches.filter(m => m.round === maxR);
        // bout이면 teamMatchId로 묶어서 확인
        const byTM = {};
        finalMatches.forEach(m => {
          if (m.teamMatchId) (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m);
        });
        Object.values(byTM).forEach(bout => {
          let t1w = 0, t2w = 0;
          const m1 = bout.find(m => m.subRound === 1);
          if (!m1) return;
          const t1 = S.teams.find(t => t.p1id === m1.p1id || t.p2id === m1.p1id);
          const t2 = S.teams.find(t => t.p1id === m1.p2id || t.p2id === m1.p2id);
          bout.forEach(m => { if (m.winner && !m.voided) { if (m.winner === m.player1) t1w++; else t2w++; } });
          const winner = t1w >= 2 ? t1 : t2w >= 2 ? t2 : null;
          if (winner) {
            content.appendChild(d('winner-banner',
              d('trophy', '🏆'), d('wname', winner.name), d('wlabel', '상위부 우승')
            ));
          }
        });
      } else {
        const maxR = Math.max(...upperMatches.map(m => m.round));
        const final = upperMatches.find(m => m.round === maxR);
        if (final?.winner && final.winner !== '?') {
          content.appendChild(d('winner-banner',
            d('trophy', '🏆'), d('wname', final.winner), d('wlabel', '상위부 우승')
          ));
        }
      }
    }

    const gLabels = getGroupLabels(S.settings.groupCount || 2);
    const sections = [
      ...gLabels.map(gid => ({ key: `group-${gid}`, label: `${gid}조 리그`, matches: S.matches.filter(m => m.phase === 'group' && m.groupId === gid) })),
      { key: 'upper', label: '🏆 상위부 토너먼트', matches: S.matches.filter(m => m.phase === 'upper') },
      { key: 'lower', label: '하위부 토너먼트', matches: S.matches.filter(m => m.phase === 'lower') },
    ].filter(s => s.matches.length > 0);

    // 현재 필터가 없거나 유효하지 않으면 첫 번째 섹션 선택
    if (!groupFilter || !sections.find(s => s.key === groupFilter)) {
      groupFilter = sections.length > 0 ? sections[0].key : null;
    }

    // 셀렉트박스
    const filterSel = h('select', {
      cls: 'group-filter-select',
      style: 'width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:12px;background:#fff',
      onchange: e => { groupFilter = e.target.value; render(); }
    }, ...sections.map(s => {
      const o = h('option', { value: s.key }, s.label);
      if (s.key === groupFilter) o.selected = true;
      return o;
    }));
    content.appendChild(filterSel);

    // 선택된 섹션만 렌더링
    const active = sections.find(s => s.key === groupFilter);
    if (active) {
      const matches = active.matches;
      if (isDandokdan && matches.some(m => m.teamMatchId)) {
        const byRound = {};
        matches.forEach(m => { (byRound[m.round] = byRound[m.round] || []).push(m); });
        Object.keys(byRound).sort((a, b) => a - b).forEach(round => {
          const list = byRound[round];
          const isTourn = list[0].phase === 'upper' || list[0].phase === 'lower';
          const rLabel = isTourn ? roundLabel('tournament', parseInt(round), list.length) : `${round}라운드`;
          content.appendChild(d('round-label', rLabel));
          const byTM = {};
          list.forEach(m => {
            if (m.teamMatchId) (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m);
            else content.appendChild(matchCard(m));
          });
          Object.keys(byTM).forEach(tmId => {
            const bout = byTM[tmId].sort((a, b) => a.subRound - b.subRound);
            content.appendChild(renderTeamBoutCard(bout));
          });
        });
      } else {
        const byRound = {};
        matches.forEach(m => { (byRound[m.round] = byRound[m.round] || []).push(m); });
        Object.keys(byRound).sort((a, b) => a - b).forEach(r => {
          const list = byRound[r];
          const isTourn = list[0].phase === 'upper' || list[0].phase === 'lower';
          const rLabel = isTourn ? roundLabel('tournament', parseInt(r), list.length) : `${r}라운드`;
          content.appendChild(d('round-label', rLabel));
          list.forEach(m => content.appendChild(matchCard(m)));
        });
      }
    }
    return content;
  }

  // 단복단: team-bout 카드로 묶어서 표시
  if (S.settings.gameType === 'dandokdan') {
    const byRound = {};
    S.matches.forEach(m => {
      (byRound[m.round] = byRound[m.round] || []).push(m);
    });
    Object.keys(byRound).sort((a, b) => a - b).forEach(round => {
      content.appendChild(d('round-label', `${round}라운드`));
      // teamMatchId로 묶기
      const byTM = {};
      byRound[round].forEach(m => {
        (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m);
      });
      Object.keys(byTM).forEach(tmId => {
        const bout = byTM[tmId].sort((a, b) => a.subRound - b.subRound);
        content.appendChild(renderTeamBoutCard(bout));
      });
    });
    return content;
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

// 단복단 팀 대결 카드 (3경기 묶음)
function renderTeamBoutCard(bout) {
  const m1 = bout[0]; // 단식1
  // 팀 이름 추출
  const t1 = S.teams.find(t => t.p1id === m1.p1id || t.p2id === m1.p1id);
  const t2 = S.teams.find(t => t.p1id === m1.p2id || t.p2id === m1.p2id);
  const t1name = t1?.name || '팀1';
  const t2name = t2?.name || '팀2';

  // 팀 승수
  let t1w = 0, t2w = 0;
  bout.forEach(m => {
    if (!m.winner || m.voided) return;
    if (m.subRound === 2) {
      // 복식: player1 = 팀1이름
      if (m.winner === m.player1) t1w++; else t2w++;
    } else {
      // 단식: player1 = 팀1 선수
      if (m.winner === m.player1) t1w++; else t2w++;
    }
  });

  const boutDone = t1w >= 2 || t2w >= 2;
  const boutWinner = t1w >= 2 ? t1name : t2w >= 2 ? t2name : null;

  const card = d(cx('team-bout-card', boutDone && 'done'));

  // 헤더: 팀이름 vs 팀이름 + 팀 스코어
  const header = d('team-bout-header',
    h('span', { cls: cx('team-bout-name', boutWinner === t1name && 'winner') }, t1name),
    h('span', { cls: 'team-bout-score' }, `${t1w} - ${t2w}`),
    h('span', { cls: cx('team-bout-name', boutWinner === t2name && 'winner') }, t2name),
  );
  card.appendChild(header);

  // 3경기 서브 리스트
  const subLabels = { 1: '단식', 2: '단식', 3: '복식' };
  bout.forEach(m => {
    const done = !!m.winner;
    const row = d(cx('team-bout-match', done && 'done', m.voided && 'voided'));
    const typeLabel = h('span', { cls: 'team-bout-type' }, subLabels[m.subRound]);
    const p1 = h('span', { cls: cx('team-bout-player', m.winner === m.player1 && 'winner') }, m.player1);
    const vs = h('span', { cls: 'team-bout-vs' }, done ? (m.score1 + m.score2 > 0 ? `${m.score1}-${m.score2}` : '✓') : m.voided ? '—' : 'vs');
    const p2 = h('span', { cls: cx('team-bout-player right', m.winner === m.player2 && 'winner') }, m.player2);

    row.appendChild(typeLabel);
    row.appendChild(p1);
    row.appendChild(vs);
    row.appendChild(p2);

    if (!m.voided && !m.isBye) {
      row.style.cursor = 'pointer';
      row.onclick = () => {
        S.modalMatchId = m.id;
        stopPolling();
        renderMain();
      };
    }

    card.appendChild(row);
  });

  return card;
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
    s('match-vs', done ? (m.score1 + m.score2 > 0 ? `${m.score1}-${m.score2}` : '완료') : 'vs'),
    h('div', { cls: cx('mp right', m.winner === m.player2 && 'winner') }, m.player2),
  ));

  // 핸디캡 표시
  const hc = calcHandicap(m);
  if (hc) {
    card.appendChild(d('ref-note', `핸디캡:`, h('span', { cls: 'ref-badge', style: 'background:#f39c12' }, `${hc.player} +${hc.pts}점`)));
  }

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

  if (tournamentType === 'group') {
    const isDandokdan = gameType === 'dandokdan';
    const isDoubles = gameType === 'doubles';

    // A조/B조 순위
    if (isDandokdan) {
      // 단단복: 팀 bout 결과로 순위
      getGroupLabels(S.settings.groupCount || 2).forEach(gid => {
        const gTeams = S.teams.filter(t => t.group === gid);
        const gMatches = S.matches.filter(m => m.phase === 'group' && m.groupId === gid);
        const stats = {};
        gTeams.forEach(t => { stats[t.name] = { name: t.name, w: 0, l: 0, sw: 0, sl: 0, pts: 0 }; });
        const byTM = {};
        gMatches.forEach(m => { if (m.teamMatchId) (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m); });
        Object.values(byTM).forEach(bout => {
          let t1w = 0, t2w = 0;
          const m1 = bout.find(m => m.subRound === 1);
          if (!m1) return;
          const t1 = gTeams.find(t => t.p1id === m1.p1id || t.p2id === m1.p1id);
          const t2 = gTeams.find(t => t.p1id === m1.p2id || t.p2id === m1.p2id);
          if (!t1 || !t2) return;
          bout.forEach(m => { if (m.winner && !m.voided) { if (m.winner === m.player1) t1w++; else t2w++; } });
          if (stats[t1.name]) { stats[t1.name].sw += t1w; stats[t1.name].sl += t2w; }
          if (stats[t2.name]) { stats[t2.name].sw += t2w; stats[t2.name].sl += t1w; }
          if (t1w >= 2 && stats[t1.name]) { stats[t1.name].w++; stats[t1.name].pts += 2; }
          if (t2w >= 2 && stats[t2.name]) { stats[t2.name].w++; stats[t2.name].pts += 2; }
          if (t1w >= 2 && stats[t2.name]) stats[t2.name].l++;
          if (t2w >= 2 && stats[t1.name]) stats[t1.name].l++;
        });
        const sorted = Object.values(stats).sort((a, b) => b.pts - a.pts || b.w - a.w || (b.sw - b.sl) - (a.sw - a.sl));
        const half = Math.ceil(gTeams.length / 2);
        content.appendChild(d('group-section-label', `${gid}조 순위`));
        content.appendChild(h('table', { cls: 'standings-table' },
          h('thead', {}, h('tr', {},
            h('th', {}, '#'), h('th', {}, '팀'),
            h('th', {}, '승점'), h('th', {}, '승'), h('th', {}, '패'), h('th', {}, '세트'),
          )),
          h('tbody', {}, ...sorted.map((t, i) => h('tr', { style: i < half ? '' : 'opacity:.5' },
            h('td', { cls: 'rank' }, `${i + 1}`),
            h('td', {}, t.name),
            h('td', { style: 'font-weight:700;color:#e74c3c' }, `${t.pts}`),
            h('td', {}, `${t.w}`), h('td', {}, `${t.l}`),
            h('td', {}, `${t.sw}-${t.sl}`),
          ))),
        ));
      });
    } else {
      // 단식/복식: 기존 buildStats 기반 순위
      getGroupLabels(S.settings.groupCount || 2).forEach(gid => {
        const gItems = isDoubles
          ? S.teams.filter(t => t.group === gid).map(t => ({ id: t.id, name: t.name, buso: null }))
          : S.players.filter(p => p.group === gid);
        const gMatches = S.matches.filter(m => m.phase === 'group' && m.groupId === gid);
        const sorted = buildStats(gItems, gMatches);
        const half = Math.ceil(gItems.length / 2);
        content.appendChild(d('group-section-label', `${gid}조 순위`));
        const hasBuso = sorted.some(p => p.buso);
        content.appendChild(h('table', { cls: 'standings-table' },
          h('thead', {}, h('tr', {},
            h('th', {}, '#'), h('th', {}, isDoubles ? '팀' : '이름'),
            hasBuso ? h('th', {}, '부수') : null,
            h('th', {}, '승점'), h('th', {}, '승'), h('th', {}, '패'),
          )),
          h('tbody', {}, ...sorted.map((p, i) => h('tr', { style: i < half ? '' : 'opacity:.5' },
            h('td', { cls: 'rank' }, `${i + 1}`),
            h('td', {}, p.name),
            hasBuso ? h('td', { style: 'color:#888;font-size:13px' }, p.buso ? `${p.buso}부` : '-') : null,
            h('td', { style: 'font-weight:700;color:#e74c3c' }, `${p.pts}`),
            h('td', {}, `${p.w}`), h('td', {}, `${p.l}`),
          ))),
        ));
      });
    }

    // 상위/하위부 bracket
    const renderBracketSection = (phase, label) => {
      const bm = S.matches.filter(m => m.phase === phase);
      if (bm.length === 0) return;
      content.appendChild(d('group-section-label', label));
      const maxRound = Math.max(...bm.map(m => m.round));
      const wrap = d('bracket-wrap');
      const rounds = d('bracket-rounds');
      for (let r = 1; r <= maxRound; r++) {
        const rm = bm.filter(m => m.round === r);
        // 단단복 bracket은 bout 단위로 표시
        if (isDandokdan && rm.some(m => m.teamMatchId)) {
          const col = d('bracket-col');
          col.appendChild(d('bracket-col-label', roundLabel('tournament', r, rm.length)));
          const byTM = {};
          rm.forEach(m => {
            if (m.teamMatchId) (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m);
            else {
              // BYE 등
              const isBye = v => v === 'BYE' || v === '?';
              const bMatch = h('div', { cls: cx('bracket-match', m.winner && 'done') });
              bMatch.appendChild(h('div', { cls: cx('bp', isBye(m.player1) && 'bye', m.winner === m.player1 && 'winner') }, m.player1 || '?'));
              bMatch.appendChild(h('hr', { cls: 'bdivider' }));
              bMatch.appendChild(h('div', { cls: cx('bp', isBye(m.player2) && 'bye', m.winner === m.player2 && 'winner') }, m.player2 || '?'));
              col.appendChild(bMatch);
            }
          });
          Object.values(byTM).forEach(bout => {
            const m1 = bout.find(m => m.subRound === 1);
            const t1 = S.teams.find(t => t.p1id === m1?.p1id || t.p2id === m1?.p1id);
            const t2 = S.teams.find(t => t.p1id === m1?.p2id || t.p2id === m1?.p2id);
            let t1w = 0, t2w = 0;
            bout.forEach(m => { if (m.winner && !m.voided) { if (m.winner === m.player1) t1w++; else t2w++; } });
            const boutDone = t1w >= 2 || t2w >= 2;
            const boutWinner = t1w >= 2 ? t1?.name : t2w >= 2 ? t2?.name : null;
            const bMatch = h('div', { cls: cx('bracket-match', boutDone && 'done') });
            bMatch.appendChild(h('div', { cls: cx('bp', boutWinner === t1?.name && 'winner') }, `${t1?.name || '?'} (${t1w})`));
            bMatch.appendChild(h('hr', { cls: 'bdivider' }));
            bMatch.appendChild(h('div', { cls: cx('bp', boutWinner === t2?.name && 'winner') }, `${t2?.name || '?'} (${t2w})`));
            col.appendChild(bMatch);
          });
          rounds.appendChild(col);
        } else {
          const col = d('bracket-col');
          col.appendChild(d('bracket-col-label', roundLabel('tournament', r, rm.length)));
          rm.forEach(m => {
            const isBye = v => v === 'BYE' || v === '?';
            const bMatch = h('div', { cls: cx('bracket-match', m.winner && 'done') });
            bMatch.appendChild(h('div', { cls: cx('bp', isBye(m.player1) && 'bye', m.winner === m.player1 && 'winner') }, m.player1 || '?'));
            bMatch.appendChild(h('hr', { cls: 'bdivider' }));
            bMatch.appendChild(h('div', { cls: cx('bp', isBye(m.player2) && 'bye', m.winner === m.player2 && 'winner') }, m.player2 || '?'));
            col.appendChild(bMatch);
          });
          rounds.appendChild(col);
        }
      }
      wrap.appendChild(rounds);
      content.appendChild(wrap);
    };
    renderBracketSection('upper', '🏆 상위부 토너먼트');
    renderBracketSection('lower', '하위부 토너먼트');
    return content;
  }

  if (gameType === 'dandokdan') {
    // 팀별 승패 통계
    const teamStats = {};
    S.teams.forEach(t => { teamStats[t.name] = { name: t.name, w: 0, l: 0 }; });
    // teamMatchId로 묶어서 팀 승패 계산
    const byTM = {};
    S.matches.filter(m => m.teamMatchId).forEach(m => {
      (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m);
    });
    Object.values(byTM).forEach(bout => {
      let t1w = 0, t2w = 0;
      const m1 = bout.find(m => m.subRound === 1);
      const t1 = S.teams.find(t => t.p1id === m1.p1id || t.p2id === m1.p1id);
      const t2 = S.teams.find(t => t.p1id === m1.p2id || t.p2id === m1.p2id);
      bout.forEach(m => {
        if (!m.winner || m.voided) return;
        if (m.winner === m.player1) t1w++; else t2w++;
      });
      if (t1w >= 2 && t1 && teamStats[t1.name]) teamStats[t1.name].w++;
      if (t2w >= 2 && t2 && teamStats[t2.name]) teamStats[t2.name].w++;
      if (t1w >= 2 && t2 && teamStats[t2.name]) teamStats[t2.name].l++;
      if (t2w >= 2 && t1 && teamStats[t1.name]) teamStats[t1.name].l++;
    });
    const sorted = Object.values(teamStats).sort((a, b) => b.w - a.w || a.l - b.l);
    content.appendChild(h('div', { style: 'font-size:13px;font-weight:700;color:#888;margin-bottom:8px' }, '팀 순위'));
    content.appendChild(h('table', { cls: 'standings-table' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, '팀'), h('th', {}, '승'), h('th', {}, '패'))),
      h('tbody', {}, ...sorted.map((t, i) => h('tr', {},
        h('td', { cls: 'rank' }, `${i + 1}`),
        h('td', {}, t.name),
        h('td', {}, `${t.w}`),
        h('td', {}, `${t.l}`),
      ))),
    ));
    return content;
  }

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
    ? S.teams.map(t => ({ id: t.id, name: t.name, buso: null }))
    : S.players;

  const sorted = buildStats(items, S.matches);
  const hasBuso = sorted.some(p => p.buso);

  return h('table', { cls: 'standings-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, '#'),
      h('th', {}, '이름'),
      hasBuso ? h('th', {}, '부수') : null,
      h('th', {}, '승점'), h('th', {}, '승'), h('th', {}, '패'), h('th', {}, '세트'),
    )),
    h('tbody', {}, ...sorted.map((p, i) => h('tr', {},
      h('td', { cls: 'rank' }, `${i + 1}`),
      h('td', {}, p.name),
      hasBuso ? h('td', { style: 'color:#888;font-size:13px' }, p.buso ? `${p.buso}부` : '-') : null,
      h('td', { style: 'font-weight:700;color:#e74c3c' }, `${p.pts}`),
      h('td', {}, `${p.w}`),
      h('td', {}, `${p.l}`),
      h('td', {}, `${p.sw}-${p.sl}`),
    ))),
  );
}

// ================================================================
// DASHBOARD TAB
// ================================================================
function renderDashboardTab() {
  const content = d('content');
  const { gameType } = S.settings;

  // 진행 현황
  const total = S.matches.filter(m => !m.isBye && !m.pending && !m.voided).length;
  const done  = S.matches.filter(m => m.winner && !m.isBye && !m.voided).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  content.appendChild(d('dash-section',
    d('dash-section-title', '진행 현황'),
    d('progress-wrap',
      d('progress-label',
        h('span', {}, `${done} / ${total} 경기 완료`),
        h('strong', {}, `${pct}%`),
      ),
      d('progress-bar', h('div', { cls: 'progress-fill', style: `width:${pct}%` })),
    ),
  ));

  // 순위
  if (S.settings.tournamentType === 'group') {
    const isDandokdan = gameType === 'dandokdan';
    const isDoubles = gameType === 'doubles';

    if (isDandokdan) {
      // 단단복 조별리그: 팀 bout 결과로 순위
      getGroupLabels(S.settings.groupCount || 2).forEach(gid => {
        const gTeams = S.teams.filter(t => t.group === gid);
        const gMatches = S.matches.filter(m => m.phase === 'group' && m.groupId === gid);
        const stats = {};
        gTeams.forEach(t => { stats[t.name] = { name: t.name, w: 0, l: 0, sw: 0, sl: 0, pts: 0 }; });
        const byTM = {};
        gMatches.forEach(m => { if (m.teamMatchId) (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m); });
        Object.values(byTM).forEach(bout => {
          let t1w = 0, t2w = 0;
          const m1 = bout.find(m => m.subRound === 1);
          if (!m1) return;
          const t1 = gTeams.find(t => t.p1id === m1.p1id || t.p2id === m1.p1id);
          const t2 = gTeams.find(t => t.p1id === m1.p2id || t.p2id === m1.p2id);
          if (!t1 || !t2) return;
          bout.forEach(m => { if (m.winner && !m.voided) { if (m.winner === m.player1) t1w++; else t2w++; } });
          if (stats[t1.name]) { stats[t1.name].sw += t1w; stats[t1.name].sl += t2w; }
          if (stats[t2.name]) { stats[t2.name].sw += t2w; stats[t2.name].sl += t1w; }
          if (t1w >= 2 && stats[t1.name]) { stats[t1.name].w++; stats[t1.name].pts += 2; }
          if (t2w >= 2 && stats[t2.name]) { stats[t2.name].w++; stats[t2.name].pts += 2; }
          if (t1w >= 2 && stats[t2.name]) stats[t2.name].l++;
          if (t2w >= 2 && stats[t1.name]) stats[t1.name].l++;
        });
        const sorted = Object.values(stats).sort((a, b) => b.pts - a.pts || b.w - a.w || (b.sw - b.sl) - (a.sw - a.sl));
        const half = Math.ceil(gTeams.length / 2);
        content.appendChild(d('dash-section',
          d('dash-section-title', `${gid}조 순위`),
          h('table', { cls: 'standings-table' },
            h('thead', {}, h('tr', {},
              h('th', {}, '#'), h('th', {}, '팀'),
              h('th', {}, '승점'), h('th', {}, '승'), h('th', {}, '패'), h('th', {}, '세트'),
            )),
            h('tbody', {}, ...sorted.map((t, i) => h('tr', { style: i < half ? '' : 'opacity:.5' },
              h('td', { cls: 'rank' }, `${i + 1}`),
              h('td', {}, t.name),
              h('td', { style: 'font-weight:700;color:#e74c3c' }, `${t.pts}`),
              h('td', {}, `${t.w}`), h('td', {}, `${t.l}`),
              h('td', {}, `${t.sw}-${t.sl}`),
            ))),
          ),
        ));
      });
    } else {
      getGroupLabels(S.settings.groupCount || 2).forEach(gid => {
        const gItems = isDoubles
          ? S.teams.filter(t => t.group === gid).map(t => ({ id: t.id, name: t.name, buso: null }))
          : S.players.filter(p => p.group === gid);
        const gMatches = S.matches.filter(m => m.phase === 'group' && m.groupId === gid);
        const sorted = buildStats(gItems, gMatches);
        const half = Math.ceil(gItems.length / 2);
        const hasBuso = sorted.some(p => p.buso);
        content.appendChild(d('dash-section',
          d('dash-section-title', `${gid}조 순위`),
          h('table', { cls: 'standings-table' },
            h('thead', {}, h('tr', {},
              h('th', {}, '#'), h('th', {}, isDoubles ? '팀' : '이름'),
              hasBuso ? h('th', {}, '부수') : null,
              h('th', {}, '승점'), h('th', {}, '승'), h('th', {}, '패'),
            )),
            h('tbody', {}, ...sorted.map((p, i) => h('tr', { style: i < half ? '' : 'opacity:.5' },
              h('td', { cls: 'rank' }, `${i + 1}`),
              h('td', {}, p.name),
              hasBuso ? h('td', { style: 'color:#888;font-size:13px' }, p.buso ? `${p.buso}부` : '-') : null,
              h('td', { style: 'font-weight:700;color:#e74c3c' }, `${p.pts}`),
              h('td', {}, `${p.w}`), h('td', {}, `${p.l}`),
            ))),
          ),
        ));
      });
    }

    // 상위/하위부 진행 현황
    ['upper', 'lower'].forEach(phase => {
      const bm = S.matches.filter(m => m.phase === phase);
      if (bm.length === 0) return;
      const bTotal = bm.filter(m => !m.isBye && !m.pending && !m.voided).length;
      const bDone = bm.filter(m => m.winner && !m.isBye && !m.voided).length;
      const label = phase === 'upper' ? '🏆 상위부' : '하위부';
      content.appendChild(d('dash-section',
        d('dash-section-title', `${label} 토너먼트`),
        h('div', { style: 'font-size:13px;color:#888;margin-bottom:4px' }, `${bDone} / ${bTotal} 경기 완료`),
      ));
    });
    return content;
  }

  if (gameType === 'dandokdan') {
    // 단단복: 팀 순위 (teamMatchId로 묶어서 계산)
    const teamStats = {};
    S.teams.forEach(t => { teamStats[t.name] = { name: t.name, w: 0, l: 0, sw: 0, sl: 0, pts: 0 }; });
    const byTM = {};
    S.matches.filter(m => m.teamMatchId).forEach(m => {
      (byTM[m.teamMatchId] = byTM[m.teamMatchId] || []).push(m);
    });
    Object.values(byTM).forEach(bout => {
      let t1w = 0, t2w = 0;
      const m1 = bout.find(m => m.subRound === 1);
      const t1 = S.teams.find(t => t.p1id === m1.p1id || t.p2id === m1.p1id);
      const t2 = S.teams.find(t => t.p1id === m1.p2id || t.p2id === m1.p2id);
      bout.forEach(m => {
        if (!m.winner || m.voided) return;
        if (m.winner === m.player1) t1w++; else t2w++;
      });
      // 세트 스코어 합산
      if (t1 && teamStats[t1.name]) { teamStats[t1.name].sw += t1w; teamStats[t1.name].sl += t2w; }
      if (t2 && teamStats[t2.name]) { teamStats[t2.name].sw += t2w; teamStats[t2.name].sl += t1w; }
      // 팀 대결 승패 (2선승 달성 시)
      if (t1w >= 2 && t1 && teamStats[t1.name]) { teamStats[t1.name].w++; teamStats[t1.name].pts += 2; }
      if (t2w >= 2 && t2 && teamStats[t2.name]) { teamStats[t2.name].w++; teamStats[t2.name].pts += 2; }
      if (t1w >= 2 && t2 && teamStats[t2.name]) teamStats[t2.name].l++;
      if (t2w >= 2 && t1 && teamStats[t1.name]) teamStats[t1.name].l++;
    });
    const sorted = Object.values(teamStats).sort((a, b) => b.pts - a.pts || b.w - a.w || (b.sw - b.sl) - (a.sw - a.sl));
    content.appendChild(d('dash-section',
      d('dash-section-title', '팀 순위'),
      h('table', { cls: 'standings-table' },
        h('thead', {}, h('tr', {},
          h('th', {}, '#'), h('th', {}, '팀'),
          h('th', {}, '승점'), h('th', {}, '승'), h('th', {}, '패'), h('th', {}, '세트'),
        )),
        h('tbody', {}, ...sorted.map((t, i) => h('tr', {},
          h('td', { cls: 'rank' }, `${i + 1}`),
          h('td', {}, t.name),
          h('td', { style: 'font-weight:700;color:#e74c3c' }, `${t.pts}`),
          h('td', {}, `${t.w}`),
          h('td', {}, `${t.l}`),
          h('td', {}, `${t.sw}-${t.sl}`),
        ))),
      ),
    ));
  } else if (gameType === 'jjampong') {
    content.appendChild(d('dash-section',
      d('dash-section-title', '단식 순위'),
      renderStandings('singles'),
    ));
    const dMatches = S.matches.filter(m => m.phase === 'doubles' && m.winner);
    if (dMatches.length > 0) {
      const dbStats = {};
      dMatches.forEach(m => {
        if (!dbStats[m.player1]) dbStats[m.player1] = { name: m.player1, w: 0, l: 0 };
        if (!dbStats[m.player2]) dbStats[m.player2] = { name: m.player2, w: 0, l: 0 };
        dbStats[m.winner].w++;
        const loser = m.winner === m.player1 ? m.player2 : m.player1;
        dbStats[loser].l++;
      });
      const dbSorted = Object.values(dbStats).sort((a, b) => b.w - a.w || a.l - b.l);
      content.appendChild(d('dash-section',
        d('dash-section-title', '복식 순위'),
        h('table', { cls: 'standings-table' },
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, '팀'), h('th', {}, '승'), h('th', {}, '패'))),
          h('tbody', {}, ...dbSorted.map((p, i) => h('tr', {},
            h('td', { cls: 'rank' }, `${i + 1}`),
            h('td', {}, p.name),
            h('td', {}, `${p.w}`),
            h('td', {}, `${p.l}`),
          ))),
        ),
      ));
    }
  } else {
    content.appendChild(d('dash-section',
      d('dash-section-title', '선수 순위'),
      renderStandings(),
    ));
  }

  return content;
}

// ================================================================
// INFO TAB
// ================================================================
function renderInfoTab() {
  const content = d('content');
  const { gameType, scoringFormat, tournamentType } = S.settings;
  const total = S.matches.filter(m => !m.isBye && !m.pending && !m.voided).length;
  const done  = S.matches.filter(m => m.winner && !m.isBye && !m.voided).length;

  if (roomCode) {
    content.appendChild(h('div', {},
      h('label', {}, '탁구대진코드'),
      d('room-code-big', roomCode),
      h('p', { style: 'text-align:center;font-size:12px;color:#aaa;margin-bottom:16px' }, 'URL 공유 또는 홈 화면 대진 목록에서 참가'),
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
    ...S.players.map((p, i) => d('info-row',
      h('span', {}, `${i + 1}. ${p.name}`),
      p.buso ? s('info-val', `${p.buso}부`) : null,
    )),
  ));

  // 결과 초기화
  const resetBtn = h('button', {
    cls: 'btn btn-secondary',
    style: 'margin-bottom:8px',
    onclick: () => {
      if (!confirm('모든 경기 결과를 초기화하시겠습니까?')) return;

      // 단단복/복식 group인 경우 upper/lower bracket의 bout 매치를 제거하고 placeholder로 교체
      if (tournamentType === 'group' && (gameType === 'dandokdan' || gameType === 'doubles')) {
        // upper/lower 매치 제거
        S.matches = S.matches.filter(m => m.phase !== 'upper' && m.phase !== 'lower');
        // group 매치 초기화
        S.matches = S.matches.map(m => {
          if (m.isBye) return m;
          return { ...m, winner: null, score1: 0, score2: 0, sets: [], voided: false };
        });
        // 빈 bracket 다시 생성
        const resetLabels = getGroupLabels(S.settings.groupCount || 2);
        let upperCount = 0, lowerCount = 0;
        resetLabels.forEach(gid => {
          const gTeams = S.teams.filter(t => t.group === gid);
          const half = Math.ceil(gTeams.length / 2);
          upperCount += half;
          lowerCount += gTeams.length - half;
        });
        const bracketType = 'doubles';
        const upper = genEmptyBracket(upperCount, 'upper', bracketType);
        const lower = genEmptyBracket(lowerCount, 'lower', bracketType);
        S.matches.push(...upper, ...lower);
      } else {
        S.matches = S.matches.map(m => {
          if (m.isBye) return m;
          const reset = { ...m, winner: null, score1: 0, score2: 0, sets: [], voided: false };
          if (m.phase === 'tournament' && m.round > 1) {
            reset.player1 = '?'; reset.player2 = '?';
            reset.p1id = null; reset.p2id = null;
            reset.pending = true;
          }
          if (m.phase === 'upper' || m.phase === 'lower') {
            reset.player1 = '?'; reset.player2 = '?';
            reset.p1id = null; reset.p2id = null;
            reset.pending = true;
          }
          return reset;
        });
        advanceTournament(S.matches);
      }

      if (roomCode) apiSave(roomCode, S);
      render();
    }
  }, '🔄 결과 초기화');

  // 대진 삭제
  const deleteBtn = h('button', {
    cls: 'btn btn-secondary',
    style: 'color:#e74c3c;border-color:#f5b8b2',
    onclick: async () => {
      if (!confirm('대진을 삭제하시겠습니까?\n(모든 데이터가 사라집니다)')) return;
      if (roomCode) await apiDelete(roomCode);
      stopPolling();
      roomCode = null;
      S.screen = 'setup';
      S.modalMatchId = null;
      history.replaceState(null, '', '/');
      render();
    }
  }, '🗑 대진 삭제');

  content.appendChild(h('div', { style: 'margin-top:8px' }, resetBtn, deleteBtn));

  return content;
}
