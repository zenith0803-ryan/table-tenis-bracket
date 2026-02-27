# 탁구 대진표 - 프로젝트 스펙

## 개요
친구/동호회용 탁구 대회 대진표 웹 앱.
Flask + In-memory 서버 (당일 시합용, 재시작 시 데이터 초기화).

## 기술 스택
| 항목 | 선택 | 비고 |
|------|------|------|
| 백엔드 | Python 3 + Flask | pip install flask |
| DB | 없음 (In-memory dict) | 서버 재시작 시 초기화 — 당일 시합용으로 충분 |
| 프론트엔드 | Vanilla JS (SPA) | 프레임워크 없음, Jinja 템플릿 1개 |
| 배포 | Render (무료) | https://table-tenis-bracket.onrender.com |

## 디렉토리 구조
```
table_tenis_bracket/
├── CLAUDE.md           # 이 파일
├── DESIGN.md           # 기능 설계 문서
├── app.py              # Flask 서버 (API + 정적 파일 서빙)
├── requirements.txt    # flask, gunicorn
├── Procfile            # Render 배포용 (web: gunicorn app:app)
├── .gitignore
├── static/
│   ├── style.css       # 전체 CSS
│   └── js/             # SPA JavaScript (모듈별 분리)
│       ├── state.js    # 상태 + 상수
│       ├── api.js      # API + 폴링
│       ├── helpers.js  # DOM 헬퍼 + 통계
│       ├── generators.js # 대진 생성 로직
│       ├── ui-setup.js # 설정/선수 등록 화면
│       ├── ui-main.js  # 메인 화면 (경기/대진표/현황/정보)
│       ├── modal.js    # 스코어 입력 모달
│       └── init.js     # 초기화
└── templates/
    ├── index.html      # HTML 골격 (CSS/JS 링크만)
    └── admin.html      # 어드민 페이지
```

## API 명세
| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | index.html 서빙 |
| POST | `/api/rooms` | 새 방 생성 → `{ code }` 반환 |
| GET | `/api/rooms/<code>` | 방 상태 조회 |
| PUT | `/api/rooms/<code>` | 방 상태 업데이트 |
| DELETE | `/api/rooms/<code>` | 방 삭제 |
| GET | `/admin?key=` | 어드민 페이지 |
| GET | `/api/admin/stats?key=` | 어드민 통계 JSON |
| POST | `/api/admin/restart?key=` | 서버 재시작 |

### 방 코드 형식
- 6자리 대문자+숫자 (혼동 방지로 O, I, 0, 1 제외)
- 예: `ABF3K7`

### In-memory 저장 구조
```python
rooms = {
  "ABF3K7": {
    "state": { ...S 전체... },
    "created": "2025-01-01T00:00:00Z",
    "updated": "2025-01-01T01:00:00Z",
  }
}
```

## 프론트엔드 상태 구조 (S)
```javascript
{
  screen: 'setup' | 'players' | 'main',
  tab: 'matches' | 'bracket' | 'dashboard' | 'info',
  settings: {
    gameType: 'singles' | 'doubles' | 'dandokdan' | 'jjampong',
    doublesMode: 'auto' | 'manual',
    scoringFormat: 'bo3' | 'bo5',
    tournamentType: 'tournament' | 'roundrobin' | 'group',
    playerCount: number,
  },
  players: [{ id, name, buso: null | number }],  // buso: 1~9부
  teams: [{ id, name, p1, p2, p1id, p2id }],
  matches: [{
    id, type, phase, round,
    player1, player2, p1id, p2id,
    winner, score1, score2,
    sets: [[string, string], ...],
    isBye, pending, referee,
  }],
  modalMatchId: null | number,
}
```

## 경기 모드
| 모드 | 설명 |
|------|------|
| 단식 | 개인 1 vs 1. 토너먼트, 리그전, 조별리그+토너먼트 |
| 복식 | 2인팀 대결. 토너먼트, 리그전, 조별리그+토너먼트. 짝수 인원만 가능 |
| 단단복 | 2인팀 단체전 (단식-단식-복식, 2선승). 토너먼트, 리그전, 조별리그+토너먼트 |
| 혼합 릴레이 | 단식 리그전 + 복식 다회전 자동 생성. 홀수 참가 가능 (복식 시 1명 돌아가며 심판) |

## 부수/핸디캡 시스템
- 1부 차이 = 게임당 2점 핸디캡, 최대 6점
- 높은 부수 번호 = 약한 선수 (9부 < 1부)
- 점수는 핸디캡 적용된 실제 점수 그대로 입력

## 득점 방식
- 3판2승제 (bo3)
- 5판3승제 (bo5)
- 빠른 입력: 승자만 선택 (세트 점수 입력은 선택 사항)

## 화면 구성
| 탭 | 내용 |
|----|------|
| 경기 | 라운드별 경기 목록, 결과 입력 |
| 대진표 | 토너먼트 브라켓 또는 리그 순위표 |
| 현황 | 진행률, 선수/팀 종합 순위 |
| 정보 | 대회 정보, 방 코드 |

## 핵심 플로우
1. `/` 접속 → 설정 화면 (새 대회 만들기 or 방 코드로 참가)
2. 설정 → 선수 등록 (이름 + 부수 설정) → 대진표 생성
3. 생성 시 서버에 방 생성 → URL이 `/?room=ABCDEF` 로 변경
4. URL 공유 → 참가자들 실시간 확인
5. 5초마다 폴링으로 결과 자동 업데이트 (모달 열려있을 땐 일시 중지)
6. 탭 전환은 클라이언트 로컬 상태 (폴링으로 덮어쓰지 않음)
7. 결과 입력 → PUT API (fire-and-forget)

## 배포 가이드 (Render 무료)
1. render.com 가입
2. New Web Service → GitHub 연동 (`zenith0803-ryan/table-tenis-bracket`)
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn app:app`
5. Deploy → 완료

## 시합 전 서버 재시작 방법 (Render)
Render 대시보드 → 서비스 선택 → **Manual Deploy** → **Deploy latest commit**

## 로컬 실행
```bash
cd table_tenis_bracket
python3 app.py
# http://127.0.0.1:5000 접속
# macOS는 5000포트를 AirPlay가 점유할 수 있음
# 시스템 설정 → 일반 → 공유 → AirPlay 수신기 끄기
```

## 알려진 제약
- In-memory 저장 → 서버 재시작 시 데이터 초기화 (당일 시합용으로 의도된 동작)
- Render 무료 티어: 15분 비활성 시 슬립 (시합 중 5초 폴링으로 자동 유지됨)
- 폴링 방식 (WebSocket 아님) → 최대 5초 딜레이
