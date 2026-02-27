import os
import sys
import random
from collections import deque
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

# In-memory storage — cleared on every server restart (by design)
rooms = {}

CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # O, I, 0, 1 제외

KST = timezone(timedelta(hours=9))

# Admin
ADMIN_KEY = os.environ.get('ADMIN_KEY', 'pingpong2026')
visit_log = deque(maxlen=500)  # 최근 500개 요청 로그
unique_ips = set()
total_requests = 0


def generate_code():
    # 형식: YYYYMMDDHHMM_ABC (예: 202502261430_7K3) — KST 기준
    now_str = datetime.now(KST).strftime('%Y%m%d%H%M')
    suffix = ''.join(random.choices(CHARS, k=3))
    code = f'{now_str}_{suffix}'
    while code in rooms:
        suffix = ''.join(random.choices(CHARS, k=3))
        code = f'{now_str}_{suffix}'
    return code


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@app.before_request
def track_visit():
    global total_requests
    # 어드민 API 자체는 추적 제외
    if request.path.startswith('/api/admin') or request.path == '/admin':
        return
    total_requests += 1
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ip:
        ip = ip.split(',')[0].strip()
    unique_ips.add(ip)
    visit_log.append({
        'time': datetime.now(KST).strftime('%m/%d %H:%M:%S'),
        'ip': ip,
        'method': request.method,
        'path': request.path,
    })


@app.get('/')
def index():
    return render_template('index.html')


MAX_ROOMS = 10


@app.post('/api/rooms')
def create_room():
    if len(rooms) >= MAX_ROOMS:
        return jsonify({'error': '최대 대진 수(10개)를 초과했습니다. 기존 대진을 삭제해주세요.'}), 400
    code = generate_code()
    now = now_iso()
    rooms[code] = {
        'state': request.json.get('state', {}),
        'created': now,
        'updated': now,
    }
    return jsonify({'code': code}), 201


@app.get('/api/rooms')
def list_rooms():
    sorted_rooms = sorted(rooms.items(), key=lambda x: x[1]['created'], reverse=True)
    result = []
    for code, data in sorted_rooms[:20]:
        result.append({
            'code': code,
            'created': data['created'],
            'playerCount': len(data.get('state', {}).get('players', [])),
        })
    return jsonify(result)


@app.get('/api/rooms/<code>')
def get_room(code):
    room = rooms.get(code)
    if not room:
        return jsonify({'error': '대진을 찾을 수 없습니다'}), 404
    return jsonify(room)


@app.put('/api/rooms/<code>')
def update_room(code):
    room = rooms.get(code)
    if not room:
        return jsonify({'error': '대진을 찾을 수 없습니다'}), 404
    room['state'] = request.json.get('state', room['state'])
    room['updated'] = now_iso()
    return jsonify({'ok': True})


@app.delete('/api/rooms/<code>')
def delete_room(code):
    if code not in rooms:
        return jsonify({'error': '대진을 찾을 수 없습니다'}), 404
    del rooms[code]
    return jsonify({'ok': True})


# ================================================================
# ADMIN
# ================================================================
def check_admin_key():
    key = request.args.get('key', '')
    if key != ADMIN_KEY:
        return False
    return True


@app.get('/admin')
def admin_page():
    if not check_admin_key():
        return '접근 권한이 없습니다. ?key=비밀번호 를 입력하세요.', 403
    return render_template('admin.html', key=ADMIN_KEY)


@app.get('/api/admin/stats')
def admin_stats():
    if not check_admin_key():
        return jsonify({'error': 'unauthorized'}), 403

    room_list = []
    for code, data in sorted(rooms.items(), key=lambda x: x[1]['created'], reverse=True):
        state = data.get('state', {})
        room_list.append({
            'code': code,
            'created': data['created'],
            'updated': data['updated'],
            'playerCount': len(state.get('players', [])),
            'matchCount': len(state.get('matches', [])),
            'gameType': state.get('settings', {}).get('gameType', ''),
        })

    return jsonify({
        'totalRequests': total_requests,
        'uniqueIps': len(unique_ips),
        'activeRooms': len(rooms),
        'rooms': room_list,
        'recentLog': list(visit_log)[-50:],  # 최근 50개
        'serverStart': app.config.get('SERVER_START', ''),
    })


@app.post('/api/admin/restart')
def admin_restart():
    if not check_admin_key():
        return jsonify({'error': 'unauthorized'}), 403
    # gunicorn 워커 종료 → 자동 재시작
    os._exit(0)


# 서버 시작 시간 기록
app.config['SERVER_START'] = datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S KST')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
