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

async function apiDelete(code) {
  const res = await fetch(`/api/rooms/${code}`, { method: 'DELETE' });
  return res.ok;
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
      const tab = S.tab; // 탭은 클라이언트 로컬 상태 — 서버 값으로 덮어쓰지 않음
      Object.assign(S, room.state);
      S.tab = tab;
      render();
    }
  }, 5000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}
