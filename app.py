import random
from datetime import datetime, timezone
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

# In-memory storage — cleared on every server restart (by design)
rooms = {}

CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # O, I, 0, 1 제외


def generate_code():
    while True:
        code = ''.join(random.choices(CHARS, k=6))
        if code not in rooms:
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


if __name__ == '__main__':
    app.run(debug=True, port=5000)
