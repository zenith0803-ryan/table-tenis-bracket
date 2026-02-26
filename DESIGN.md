# 기능 설계 문서

## 구현 예정 기능

### 1. 탭 전환 버그 수정 ✅ (완료)
`startPolling()` 폴링 시 `S.tab`이 서버 값으로 덮어씌워지는 문제.
탭은 클라이언트 로컬 상태이므로 폴링 후에도 유지.

```javascript
// static/app.js - startPolling()
const tab = S.tab;
Object.assign(S, room.state);
S.tab = tab;  // 클라이언트 탭 상태 복원
```

---

### 2. 빠른 승패 입력 (renderModal 재설계)

**현재:** 세트 점수 필수 입력
**변경:** 승자 버튼 클릭만으로 완료, 점수는 선택 옵션

```
┌──────────────────────────────┐
│  선수A          vs  선수B    │
│  핸디캡: 선수A +4점 (2부차)  │  ← 부수 설정 시만 표시
│                              │
│  [ 선수A 승 ]  [ 선수B 승 ]  │  ← 기본 입력
│                              │
│  ▾ 점수 상세 입력 (선택)     │  ← 토글
│    1세트: [__] - [__]        │
│    [+ 세트 추가]             │
│                              │
│  [취소]                      │
└──────────────────────────────┘
```

- 빠른 입력 시: `sets: [], score1: winsNeeded(), score2: 0, winner`
- 세트 입력 시: 기존 로직 동일 (N세트 먼저 이겨야 저장 가능)
- `let showDetail = false` 로컬 상태로 토글 관리

---

### 3. 현황 탭 추가 (renderDashboardTab)

탭 순서: `[경기] [대진표] [현황] [정보]`

```
진행 현황
[████████░░░░] 7 / 10 경기 완료

순위
#  이름      부수  승점  승  패  세트
─────────────────────────────────────
1  김철수    3부    6    3   0   9-3
2  박영희    5부    4    2   1   7-5
3  이민준    7부    2    1   2   5-7
```

- 모든 게임 타입에서 항상 표시
- 리그전: 전체 순위
- 토너먼트: 현재까지 경기 기준 순위
- 혼합 릴레이: 단식/복식 순위 구분
- 기존 `buildStats()`, `renderStandings()` 재사용
- standings-table에 부수 컬럼 추가 (미설정 시 `-`)

---

### 4. 부수 + 핸디캡 시스템

#### 규칙
- 1부 차이 = 게임당 2점 핸디캡
- 최대 6점 (3부 이상 차이 시 동일 적용)
- 높은 부수 번호 = 약한 선수 (9부 < 8부 < ... < 1부)

#### State 변경
```javascript
players: [{ id, name, buso: null }]
// buso: 1~9 (부수) or null (미설정)
```

#### 선수 등록 화면
- 이름 입력 옆 부수 select 추가: `미설정 / 1부 / 2부 / ... / 9부`

#### 핸디캡 계산
```javascript
function calcHandicap(match) {
  const p1 = S.players.find(p => p.id === match.p1id);
  const p2 = S.players.find(p => p.id === match.p2id);
  if (!p1?.buso || !p2?.buso || p1.buso === p2.buso) return null;
  const diff = Math.abs(p1.buso - p2.buso);
  const pts = Math.min(diff * 2, 6);
  const weakerName = p1.buso > p2.buso ? match.player1 : match.player2;
  return { player: weakerName, pts };
}
```

#### 핸디캡 표시
- **matchCard**: 심판 표시와 동일한 스타일로 `선수명 +N점 핸디캡` 표시
- **renderModal**: 선수 이름 하단에 핸디캡 정보 표시
- 점수 계산은 변경 없음 (실제 경기에서 핸디캡이 반영된 점수를 입력)

---

## 수정 파일
| 파일 | 변경 내용 |
|------|-----------|
| `static/app.js` | 전체 기능 (탭버그/모달/현황탭/부수) |
| `static/style.css` | 현황탭, 진행바 스타일 추가 |

---

## CSS 추가 항목
```css
/* 진행 현황 바 */
.progress-bar { ... }
.progress-fill { ... }

/* 현황 탭 섹션 제목 */
.dash-section-title { ... }

/* 빠른 승패 버튼 */
.win-btn { ... }

/* 점수 상세 토글 */
.detail-toggle { ... }
```
