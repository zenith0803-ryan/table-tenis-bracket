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
async function renderSetupHome(onNew) {
  app.innerHTML = '';
  app.appendChild(d('header', h('h1', {}, '🏓 탁구매치')));

  const content = d('content');
  content.appendChild(d('hero',
    d('hero-icon', '🏓'),
    d('hero-title', '탁구매치'),
    d('hero-sub', '친구들과 함께하는 탁구 대회'),
  ));
  content.appendChild(h('button', { cls: 'btn btn-primary', onclick: onNew }, '새 대회 만들기'));
  content.appendChild(h('hr', { cls: 'divider' }));

  const listTitle = d('dash-section-title', '최근 대진');
  const listEl = h('div', {});
  content.appendChild(listTitle);
  content.appendChild(listEl);
  app.appendChild(content);

  const joinRoom = async (code) => {
    const room = await apiGet(code);
    if (!room) { alert('대진을 찾을 수 없습니다.\n서버가 재시작되었을 수 있습니다.'); return; }
    roomCode = code;
    Object.assign(S, room.state);
    history.replaceState(null, '', `?room=${code}`);
    startPolling();
    render();
  };

  try {
    const res = await fetch('/api/rooms');
    const roomList = await res.json();
    if (roomList.length === 0) {
      listEl.appendChild(h('p', { style: 'text-align:center;color:#aaa;font-size:13px;padding:16px 0' }, '개설된 대진이 없습니다'));
    } else {
      roomList.forEach(room => {
        const dt = new Date(room.created);
        const timeStr = `${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        const card = h('div', { cls: 'match-card', style: 'display:flex;align-items:center;gap:8px' });
        const info = h('div', { style: 'flex:1;cursor:pointer' });
        info.appendChild(d('match-players',
          h('div', { cls: 'mp', style: 'font-family:monospace;font-size:13px;font-weight:600' }, room.code),
          s('match-vs', `${room.playerCount}명`),
          h('div', { cls: 'mp right', style: 'font-size:12px;color:#aaa;font-weight:400' }, timeStr),
        ));
        info.onclick = () => joinRoom(room.code);
        const delBtn = h('button', {
          style: 'background:none;border:none;font-size:18px;cursor:pointer;padding:4px;opacity:.5;flex-shrink:0',
          onclick: async (e) => {
            e.stopPropagation();
            if (!confirm(`대진 "${room.code}"을 삭제하시겠습니까?`)) return;
            await apiDelete(room.code);
            renderSetupHome(onNew);
          }
        }, '🗑');
        card.appendChild(info);
        card.appendChild(delBtn);
        listEl.appendChild(card);
      });
    }
  } catch (_) {
    listEl.appendChild(h('p', { style: 'text-align:center;color:#aaa;font-size:13px;padding:16px 0' }, '대진 목록을 불러올 수 없습니다'));
  }
}

function renderSetupNew(tmp, onBack) {
  const draw = () => {
    app.innerHTML = '';
    app.appendChild(d('header', h('h1', {}, '🏓 탁구매치')));

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
        { value: 'singles',    label: LABEL.gameType.singles },
        { value: 'doubles',    label: LABEL.gameType.doubles },
        { value: 'dandokdan',  label: LABEL.gameType.dandokdan },
        { value: 'jjampong',   label: LABEL.gameType.jjampong },
      ], 'gameType')),
      d('form-group', h('label', {}, '득점 방식'), optGroup([
        { value: 'bo3', label: LABEL.format.bo3 },
        { value: 'bo5', label: LABEL.format.bo5 },
      ], 'scoringFormat')),
    ];

    if (tmp.gameType !== 'jjampong') {
      const modeOpts = [
        { value: 'roundrobin', label: LABEL.mode.roundrobin },
        { value: 'tournament', label: LABEL.mode.tournament },
      ];
      if (tmp.gameType === 'singles') {
        modeOpts.push({ value: 'group', label: LABEL.mode.group });
      }
      fields.push(d('form-group', h('label', {}, '경기 방식'), optGroup(modeOpts, 'tournamentType')));
    }
    if (tmp.gameType === 'doubles' || tmp.gameType === 'dandokdan') {
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
          S.players = Array.from({ length: tmp.playerCount }, (_, i) => ({ id: i + 1, name: `선수${i + 1}`, buso: null }));
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
    ((gameType === 'doubles' || gameType === 'dandokdan') && doublesMode === 'manual')
      ? Array.from({ length: Math.floor(playerCount / 2) }, (_, i) => ({ id: i + 1, p1id: null, p2id: null, p1: '', p2: '', name: '' }))
      : [];

  const draw = () => {
    app.innerHTML = '';
    app.appendChild(d('header', h('h1', {}, '선수 등록')));

    const busoOpts = ['미설정', ...Array.from({ length: 9 }, (_, i) => `${i + 1}부`)];

    const playerInputs = players.map((p, i) => {
      const inp = h('input', { type: 'text', value: p.name, placeholder: `선수 ${i + 1}`, style: 'flex:1' });
      inp.oninput = e => { players[i].name = e.target.value || `선수${i + 1}`; };

      const busoSel = h('select', { style: 'width:72px;padding:11px 6px;border:1px solid #ddd;border-radius:8px;font-size:13px', onchange: e => {
        const v = e.target.value;
        players[i].buso = v === '미설정' ? null : parseInt(v);
      }}, ...busoOpts.map(opt => {
        const o = h('option', { value: opt }, opt);
        const cur = p.buso ? `${p.buso}부` : '미설정';
        if (opt === cur) o.selected = true;
        return o;
      }));

      return d('player-row', s('player-num', `${i + 1}.`), inp, busoSel);
    });

    let teamSection = null;
    if ((gameType === 'doubles' || gameType === 'dandokdan') && doublesMode === 'manual') {
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

            if ((gt === 'doubles' || gt === 'dandokdan') && S.players.length % 2 !== 0) {
              alert(`${gt === 'doubles' ? '복식' : '단복단'}은 짝수 인원만 가능합니다.\n현재 ${S.players.length}명 → ${S.players.length + 1}명 또는 ${S.players.length - 1}명으로 변경해주세요.`);
              return;
            }

            if (gt === 'singles' && tournamentType === 'group') {
              if (S.players.length < 4) {
                alert('조별 리그는 최소 4명 이상 필요합니다.');
                return;
              }
              S.matches = genGroupTournament(S.players);
            } else if (gt === 'singles') {
              S.matches = tournamentType === 'roundrobin' ? genRoundRobin(S.players) : genTournament(S.players);
            } else if (gt === 'doubles') {
              const r = genDoubles(S.players, dm, tournamentType, dm === 'manual' ? teams : []);
              S.teams = r.teams; S.matches = r.matches;
            } else if (gt === 'dandokdan') {
              const r = genDandokdan(S.players, dm, tournamentType, dm === 'manual' ? teams : []);
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
