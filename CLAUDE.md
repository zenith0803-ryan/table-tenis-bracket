# 탁구 대진표 - 프로젝트 스펙

## 개요
친구/동호회용 탁구 대회 대진표 웹 앱.
단일 HTML 파일에서 **Flask + PostgreSQL 서버 앱**으로 전환.

## 기술 스택
| 항목 | 선택 | 비고 |
|------|------|------|
| 백엔드 | Python 3 + Flask | pip install flask |
| DB | PostgreSQL | `psycopg2` 드라이버, `DATABASE_URL` 환경변수 |
| 프론트엔드 | Vanilla JS (SPA) | 프레임워크 없음, Jinja 템플릿 1개 |
| 배포 | Railway / Render | PostgreSQL 애드온 제공 |
| 대안 배포 | Supabase + Railway | 무료 PostgreSQL 호스팅 가능 |

## 디렉토리 구조
```
table_tenis_bracket/
├── CLAUDE.md           # 이 파일
├── app.py              # Flask 서버 (API + 정적 파일 서빙)
├── requirements.txt    # flask, gunicorn, psycopg2-binary
├── Procfile            # Railway/Render 배포용
├── .gitignore
├── .env                # DATABASE_URL 환경변수 (git 제외)
└── templates/
    └── index.html      # 전체 SPA (CSS + JS 포함)
```

## API 명세
| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | index.html 서빙 |
| POST | `/api/rooms` | 새 방 생성 → `{ code }` 반환 |
| GET | `/api/rooms/<code>` | 방 상태 조회 |
| PUT | `/api/rooms/<code>` | 방 상태 업데이트 |

### 방 코드 형식
- 6자리 대문자+숫자 (혼동 방지로 O, I, 0, 1 제외)
- 예: `ABF3K7`

### DB 스키마
```sql
CREATE TABLE rooms (
    code    VARCHAR(6) PRIMARY KEY,
    state   JSONB NOT NULL,         -- JSON blob (전체 S 상태)
    created TIMESTAMPTZ NOT NULL,   -- ISO datetime
    updated TIMESTAMPTZ NOT NULL    -- ISO datetime
);
```

## 프론트엔드 상태 구조 (S)
```javascript
{
  screen: 'setup' | 'players' | 'main',
  tab: 'matches' | 'bracket' | 'info',
  settings: {
    gameType: 'singles' | 'doubles' | 'jjampong',
    doublesMode: 'auto' | 'manual',
    scoringFormat: 'bo3' | 'bo5',
    tournamentType: 'tournament' | 'roundrobin',
    playerCount: number,
  },
  players: [{ id, name }],           // 항상 개인 선수
  teams: [{ id, p1, p2, p1id, p2id }], // 복식/짬뽕 팀
  matches: [{
    id, type, phase, round,
    player1, player2,
    winner, score1, score2,
    sets: [[string, string], ...]
  }],
  modalMatchId: null | number,
}
```

## 경기 모드
| 모드 | 설명 |
|------|------|
| 단식 | 개인 1 vs 1. 토너먼트 or 리그전 |
| 복식 | 2인팀 대결. 자동 매칭(랜덤) or 직접 팀 구성 |
| 짬뽕 | 단식+복식 혼합. 개인 이름 입력 → 단식 리그전 + 복식 다회전 자동 생성. 홀수 참가 가능 (복식 시 1명 돌아가며 심판) |

## 득점 방식
- 3판2승제 (bo3)
- 5판3승제 (bo5)

## 핵심 플로우
1. `/` 접속 → 설정 화면 (새 대회 만들기 or 방 코드로 참가)
2. 설정 → 선수 등록 → 대진표 생성
3. 생성 시 서버에 방 생성 → URL이 `/?room=ABCDEF` 로 변경
4. URL을 카카오톡 등으로 공유 → 참가자들 실시간 확인
5. 5초마다 폴링으로 결과 자동 업데이트 (모달 열려있을 땐 일시 중지)
6. 결과 입력 → saveState() → PUT API (fire-and-forget)

## 공유 방식 변경 (기존 HTML 파일 대비)
- 기존: 결과 HTML 파일 다운로드 후 카카오톡 전송
- 변경: URL만 공유 (🔗 버튼 → 클립보드 복사)

## 배포 가이드 (Railway)
1. railway.app 가입 후 새 프로젝트 생성
2. GitHub 연동 또는 `railway up`으로 배포
3. PostgreSQL 플러그인 추가 → `DATABASE_URL` 자동 주입
4. 환경변수 설정 확인 후 Deploy → 완료

## 배포 가이드 (Render 무료)
1. render.com 가입
2. New Web Service → GitHub 연동
3. New PostgreSQL → 연결 후 `DATABASE_URL` 환경변수 설정
4. Deploy → 완료

## 로컬 실행
```bash
pip install -r requirements.txt
export DATABASE_URL=postgresql://user:password@localhost:5432/tournament
python app.py
# http://localhost:5000 접속
```

## 알려진 제약
- PostgreSQL 서버가 별도로 필요 (로컬: Docker 또는 직접 설치)
- 폴링 방식 (WebSocket 아님) → 5초 딜레이 있음
- Render 무료 티어: 90일 후 DB 삭제됨 (유료 플랜 권장)
