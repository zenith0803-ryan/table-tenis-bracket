# 기능 설계 문서

## 완료된 기능 ✅

| 기능 | 설명 |
|------|------|
| 탭 전환 버그 수정 | 폴링 시 `S.tab` 클라이언트 상태 유지 |
| 빠른 승패 입력 | 승자 선택 → 세트 스코어 버튼 (2-0, 2-1 등) |
| 종합 현황판 탭 | 진행률 + 순위표 |
| 부수 + 핸디캡 | 1부 차이 = 2점, 최대 6점, matchCard + 모달 표시 |
| CSS/JS 분리 | `static/style.css`, `static/app.js` 별도 파일 |
| 방 코드 형식 | `YYYYMMDDHHMM_ABC` 타임스탬프 형식 |
| 홈 방 목록 | 최근 방 리스트업, 클릭으로 참가 |
| UI 리디자인 | 그라디언트 헤더, 카드 섀도, 호버 애니메이션 |

---

## 구현 예정 기능

### 1. 방 삭제 / 결과 초기화

#### 1-A. 방 삭제
- **app.py**: `DELETE /api/rooms/<code>` 엔드포인트
- **홈 화면 방 목록**: 각 카드 우측 🗑 버튼 → confirm → 삭제 → 목록 새로고침
- **정보 탭**: "방 삭제" 버튼 → 홈으로 이동

#### 1-B. 결과 초기화 (방 수정)
- **정보 탭**: "결과 초기화" 버튼
- 모든 match의 winner/score/sets 초기화
- tournament phase 재계산

---

### 2. 홈으로 나가기 버튼

- 메인 헤더에 🏠 버튼 추가
- confirm → stopPolling → roomCode = null → URL `/` → 홈 화면

---

### 3. 단복단 (단식-복식-단식) 팀 대결

#### 규칙
- 팀 구성: 2명 1팀 (자동 or 직접)
- 팀 대결 순서:
  1. 단식 — A팀 1번 vs B팀 1번
  2. 복식 — A팀 (1+2) vs B팀 (1+2)
  3. 단식 — A팀 2번 vs B팀 2번
- **2선승제**: 먼저 2경기 이긴 팀 승리, 나머지 경기 voided(회색)
- 팀 간 방식: 리그전 or 토너먼트

#### State 추가
```javascript
settings.gameType: 'dandokdan'
settings.doublesMode: 'auto' | 'manual'
// match 필드 추가
teamMatchId: number   // 3경기를 묶는 ID
subRound: 1 | 2 | 3  // 1=단식A, 2=복식, 3=단식B
voided: boolean       // 세트 확정 후 불필요 경기
```

#### 신규 함수
- `genDandokdan(players, mode, tournamentType, existingTeams)`: 팀 생성 + 경기 스케줄
- `checkTeamBoutWinner(teamMatchId)`: 2승 확인 → voided 처리
- `saveResult()` 수정 → checkTeamBoutWinner 호출

#### UI
```
┌─ A팀 [1] vs [1] B팀 ──────────┐
│  단식  A팀1 ✓   vs   B팀1     │
│  복식  A팀  1-0  vs   B팀     │
│  단식  A팀2      vs   B팀2 ░  │  ← voided
└───────────────────────────────┘
```

---

### 4. 조별 리그 + 상위/하위부 토너먼트

#### 흐름
```
선수 N명 → snake draft로 A조 / B조 자동 배정
각 조 리그전 → 조별 순위 결정
상위 50%: 상위부 토너먼트 (1위, 2위 시상)
하위 50%: 하위부 토너먼트 (1위, 2위 시상)
```

#### 조 배정 (Snake Draft)
부수 설정 시 부수 순 정렬, 미설정 시 랜덤 셔플 후:
```
순서: 1→A, 2→B, 3→B, 4→A, 5→A, 6→B ...
```
→ 각 조의 실력 분포가 균등

#### State 추가
```javascript
settings.tournamentType: 'group'  // 새 옵션
players: [{ id, name, buso, group: 'A'|'B' }]
// match 필드 추가
groupId: 'A' | 'B' | null
```

#### 신규 함수
- `genGroupTournament(players)`: snake draft 배정 + 조별 리그 + 빈 bracket 생성
- `advanceGroupTournament()`: 조 리그 완료 시 상위/하위부 자동 배치

#### 렌더링
- **경기 탭**: A조 리그 → B조 리그 → 상위부 → 하위부 순
- **대진표 탭**: A조 순위 / B조 순위 / 상위부 bracket / 하위부 bracket
- **현황판**: 전체 진행률 + A/B조 순위 + 상위/하위부 현황

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `static/app.js` | 홈 버튼, 방 삭제, 단복단, 조별 리그 전체 |
| `app.py` | DELETE /api/rooms/<code> |
| `static/style.css` | team-bout-card, voided, group-label 스타일 |
