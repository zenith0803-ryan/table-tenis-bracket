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
