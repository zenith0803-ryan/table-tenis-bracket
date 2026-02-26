import random
from datetime import datetime, timezone
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

# In-memory storage — cleared on every server restart (by design)
rooms = {}

CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # O, I, 0, 1 제외


def generate_code():
    # 형식: YYYYMMDDHHMM_ABC (예: 202502261430_7K3)
    now_str = datetime.now().strftime('%Y%m%d%H%M')
    suffix = ''.join(random.choices(CHARS, k=3))
    code = f'{now_str}_{suffix}'
    while code in rooms:
        suffix = ''.join(random.choices(CHARS, k=3))
        code = f'{now_str}_{suffix}'
    return code


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@app.get('/')
def index():
    return render_template('index.html')


@app.post('/api/rooms')
def create_room():
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
        return jsonify({'error': '방을 찾을 수 없습니다'}), 404
    return jsonify(room)


@app.put('/api/rooms/<code>')
def update_room(code):
    room = rooms.get(code)
    if not room:
        return jsonify({'error': '방을 찾을 수 없습니다'}), 404
    room['state'] = request.json.get('state', room['state'])
    room['updated'] = now_iso()
    return jsonify({'ok': True})


@app.delete('/api/rooms/<code>')
def delete_room(code):
    if code not in rooms:
        return jsonify({'error': '방을 찾을 수 없습니다'}), 404
    del rooms[code]
    return jsonify({'ok': True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
