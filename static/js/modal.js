// ================================================================
// SCORE MODAL (승자 선택 → 세트 스코어 선택)
// ================================================================
function renderModal() {
  const match = S.matches.find(m => m.id === S.modalMatchId);
  if (!match) return null;

  const needed = winsNeeded(match);
  const hc = calcHandicap(match);
  // 이미 결과가 있으면 해당 승자를 초기 선택 상태로
  let selectedWinner = match.winner || null;

  const overlay = d('overlay');

  const saveResult = (winner, score1, score2) => {
    const idx = S.matches.findIndex(m => m.id === S.modalMatchId);
    S.matches[idx] = { ...match, sets: [], score1, score2, winner };
    if (match.phase === 'tournament') advanceTournament(S.matches);
    if (match.phase === 'upper') {
      if (S.settings.gameType === 'dandokdan') advanceDandokdanBracket('upper');
      else advanceBracket(S.matches.filter(m => m.phase === 'upper'));
    }
    if (match.phase === 'lower') {
      if (S.settings.gameType === 'dandokdan') advanceDandokdanBracket('lower');
      else advanceBracket(S.matches.filter(m => m.phase === 'lower'));
    }
    if (match.teamMatchId) checkTeamBoutWinner(match.teamMatchId);
    if (match.phase === 'group') advanceGroupTournament();
    S.modalMatchId = null;
    if (roomCode) apiSave(roomCode, S);
    startPolling();
    renderMain();
  };

  const draw = () => {
    overlay.innerHTML = '';
    const modal = d('modal');

    modal.appendChild(d('modal-title', '경기 결과 입력'));
    modal.appendChild(d('modal-players',
      h('span', {}, match.player1),
      s('modal-vs', 'vs'),
      h('span', {}, match.player2),
    ));

    if (hc) {
      modal.appendChild(d('modal-handicap', `🏸 핸디캡: ${hc.player} +${hc.pts}점`));
    }

    if (!selectedWinner) {
      // ── 1단계: 승자 선택 ──
      modal.appendChild(h('p', { style: 'font-size:13px;color:#888;margin-bottom:10px;text-align:center' }, '승자를 선택하세요'));
      modal.appendChild(d('win-btns',
        h('button', { cls: 'win-btn p1', onclick: () => { selectedWinner = match.player1; draw(); } }, `🏆 ${match.player1} 승`),
        h('button', { cls: 'win-btn p2', onclick: () => { selectedWinner = match.player2; draw(); } }, `🏆 ${match.player2} 승`),
      ));
    } else {
      // ── 2단계: 세트 스코어 선택 ──
      const isP1 = selectedWinner === match.player1;
      modal.appendChild(h('div', { style: 'text-align:center;font-weight:700;color:#27ae60;margin-bottom:12px' }, `✅ ${selectedWinner} 승`));
      modal.appendChild(h('p', { style: 'font-size:13px;color:#888;margin-bottom:10px;text-align:center' }, '세트 스코어를 선택하세요'));

      // 세트 스코어 버튼: 승자는 needed, 패자는 0 ~ needed-1
      const scoreRow = d('win-btns');
      for (let loserSets = 0; loserSets < needed; loserSets++) {
        const s1 = isP1 ? needed : loserSets;
        const s2 = isP1 ? loserSets : needed;
        scoreRow.appendChild(h('button', {
          cls: 'win-btn',
          style: 'border-color:#27ae60;color:#27ae60;',
          onclick: () => saveResult(selectedWinner, s1, s2),
        }, `${s1} - ${s2}`));
      }
      modal.appendChild(scoreRow);

      // 스코어 없이 저장
      modal.appendChild(h('button', {
        cls: 'btn btn-secondary', style: 'margin-top:4px',
        onclick: () => saveResult(selectedWinner, 0, 0),
      }, '스코어 없이 저장'));

      // 뒤로가기
      modal.appendChild(h('button', {
        cls: 'detail-toggle', style: 'margin-top:6px',
        onclick: () => { selectedWinner = null; draw(); },
      }, '← 승자 다시 선택'));
    }

    // 취소
    modal.appendChild(h('button', {
      cls: 'btn btn-secondary', style: 'margin-top:10px',
      onclick: () => { S.modalMatchId = null; startPolling(); renderMain(); }
    }, '취소'));

    overlay.appendChild(modal);
  };

  draw();

  overlay.onclick = e => {
    if (e.target === overlay) { S.modalMatchId = null; startPolling(); renderMain(); }
  };

  return overlay;
}
