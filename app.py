import time, random, string, os
from flask import Flask, render_template, request, jsonify

app = Flask(__name__, static_folder="static")

# -----------------------------
# Globals
# -----------------------------
LOBBIES = {}
HOST_KEY = os.environ.get("HOST_KEY", "yourSecretKey")

# -----------------------------
# Helpers
# -----------------------------
def _new_code(n=5):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(n))

def _make_faces(total_cards):
    EMOJIS = [
        "🍓","🍇","🍒","🍉","🍍","🥝","🍑","🍋","🍊","🥥","🫐","🍏",
        "🐱","🐶","🦊","🐻","🐼","🐸","🐵","🐰","🦄","🐙","🦋","🐝",
        "⭐","🌙","☁️","🔥","🍀","🌈","💎","🎀","🎲","🎯","🎮","🎧"
    ]
    pairs = total_cards // 2
    pool = EMOJIS[:]
    random.shuffle(pool)
    chosen = pool[:pairs]
    faces = chosen + chosen
    random.shuffle(faces)
    return faces

# -----------------------------
# Pages
# -----------------------------
@app.route("/")
def home():
    return render_template("home.html")

@app.route("/host")
def host():
    return render_template("host.html")

@app.route("/join")
def join():
    return render_template("join.html")

@app.route("/play/<code>")
def play(code):
    return render_template("play.html", code=code)

@app.route("/watch/<code>")
def watch(code):
    return render_template("watch.html", code=code)

@app.route("/watch")
def watch_landing():
    return render_template("watch_home.html")

# -----------------------------
# Host API
# -----------------------------
@app.post("/api/host/create_lobby")
def create_lobby():
    data = request.get_json(silent=True) or {}

    hk = request.headers.get("X-Host-Key", "")
    if HOST_KEY and hk != HOST_KEY:
        return jsonify(ok=False, error="Bad host key"), 403

    rows = int(data.get("rows", 4))
    cols = int(data.get("cols", 5))
    mode = data.get("mode", "solo")
    entry_mode = data.get("entry_mode", "free")

    total = rows * cols
    if total % 2 != 0:
        return jsonify(ok=False, error="Board must be even"), 400

    code = _new_code()
    while code in LOBBIES:
        code = _new_code()

    LOBBIES[code] = {
        "code": code,
        "rows": rows,
        "cols": cols,
        "mode": mode,
        "entry_mode": entry_mode,
        "status": "waiting",
        "faces": _make_faces(total),
        "players": {},
    }

    return jsonify(ok=True, lobby=LOBBIES[code])

@app.post("/api/host/start_round/<code>")
def start_round(code):
    hk = request.headers.get("X-Host-Key", "")
    if HOST_KEY and hk != HOST_KEY:
        return jsonify(ok=False, error="Bad host key"), 403

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False, error="Lobby not found"), 404

    lobby["status"] = "running"
    return jsonify(ok=True)
    @app.post("/api/host/next_round/<code>")

@app.post("/api/host/next_round/<code>")
def next_round(code):
    hk = request.headers.get("X-Host-Key", "")
    if HOST_KEY and hk != HOST_KEY:
        return jsonify(ok=False, error="Bad host key"), 403

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False, error="Lobby not found"), 404

    # Reset player boards
    total = lobby["rows"] * lobby["cols"]
    lobby["faces"] = _make_faces(total)

    for p in lobby["players"].values():
        p["revealed"] = [None] * total
        p["matched"] = set()
        p["picks"] = []
        p["hide_at"] = None

    lobby["status"] = "running"

    return jsonify(ok=True)


@app.post("/api/host/end_round/<code>")
def end_round(code):
    hk = request.headers.get("X-Host-Key", "")
    if HOST_KEY and hk != HOST_KEY:
        return jsonify(ok=False, error="Bad host key"), 403

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False, error="Lobby not found"), 404

    lobby["status"] = "ended"
    return jsonify(ok=True)



# -----------------------------
# Player API
# -----------------------------
@app.post("/api/join")
def join_game():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    name = data.get("name", "Player")

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False, error="Lobby not found"), 404

    pid = _new_code(8)
    total = lobby["rows"] * lobby["cols"]

    lobby["players"][pid] = {
        "name": name,
        "revealed": [None] * total,
        "matched": set(),
        "picks": [],
        "hide_at": None,
        "score": 0,
        "matches": 0,
        "misses": 0,
    }

    return jsonify(ok=True, player_id=pid)

@app.get("/api/state/<code>/<pid>")
def get_state(code, pid):
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False), 404

    p = lobby["players"].get(pid)
    if not p:
        return jsonify(ok=False), 404

    if p.get("hide_at") and time.time() >= p["hide_at"]:
        for i in p["picks"]:
            if i not in p["matched"]:
                p["revealed"][i] = None
        p["picks"] = []
        p["hide_at"] = None

    return jsonify(
        ok=True,
        state={
            "lobby": {
                "rows": lobby["rows"],
                "cols": lobby["cols"],
                "status": lobby["status"],
                "player_count": len(lobby["players"]),
                "mode": lobby["mode"],
            },
            "grid": {
                "faces": p["revealed"],
                "matched": list(p["matched"]),
                "cols": lobby["cols"],
            },
            "player": {
                "name": p["name"],
                "score": p["score"],
                "matches": p["matches"],
                "misses": p["misses"],
            },
        },
        leaderboard={
            "players": [
                {
                    "name": v["name"],
                    "score": v["score"],
                    "matches": v["matches"],
                    "misses": v["misses"],
                }
                for v in lobby["players"].values()
            ]
        }
    )
@app.get("/watch")
def watch_home():
    return render_template("watch_home.html")

@app.get("/api/watch/<code>")
def watch_state(code):
    code = (code or "").strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False, error="Lobby not found"), 404

    players = []
    for pid, p in lobby["players"].items():
        players.append({
            "id": pid,
            "name": p["name"],
            "faces": p["revealed"],
            "matched": list(p["matched"]),
            "score": p["score"],
            "matches": p["matches"],
            "misses": p["misses"],
        })

    return jsonify(
        ok=True,
        lobby={
            "code": lobby["code"],
            "rows": lobby["rows"],
            "cols": lobby["cols"],
            "status": lobby["status"],
            "mode": lobby["mode"],
        },
        players=players
    )

@app.get("/api/spectate/<code>")
def spectate(code):
    code = (code or "").strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False, error="Lobby not found"), 404

    players = []
    for p in lobby["players"].values():
        players.append({
            "name": p["name"],
            "revealed": p["revealed"],
            "matched": list(p["matched"]),
            "score": p["score"],
            "matches": p["matches"],
            "misses": p["misses"],
        })

    return jsonify(
        ok=True,
        lobby={
            "rows": lobby["rows"],
            "cols": lobby["cols"],
            "status": lobby["status"],
        },
        players=players
    )

@app.post("/api/flip")
def flip():
    data = request.get_json(silent=True) or {}
    code = data.get("code")
    pid = data.get("player_id")
    idx = int(data.get("idx", -1))

    lobby = LOBBIES.get(code)
    if not lobby or lobby["status"] != "running":
        return jsonify(ok=False)

    p = lobby["players"].get(pid)
    if not p:
        return jsonify(ok=False)

    faces = lobby["faces"]

    if idx < 0 or idx >= len(faces):
        return jsonify(ok=False)

    if idx in p["matched"] or p["revealed"][idx]:
        return jsonify(ok=True)

    if p["hide_at"] and time.time() < p["hide_at"]:
        return jsonify(ok=False)

    p["revealed"][idx] = faces[idx]
    p["picks"].append(idx)

    if len(p["picks"]) == 2:
        a, b = p["picks"]
        if faces[a] == faces[b]:
            p["matched"].update([a, b])
            p["score"] += 10
            p["matches"] += 1
            p["picks"] = []
        else:
            p["misses"] += 1
            p["hide_at"] = time.time() + 0.4

    return jsonify(ok=True)
