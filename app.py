import time
import random
import string
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

LOBBIES = {}

# -----------------------------
# Helpers
# -----------------------------
def make_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=5))

def public_lobby(lobby):
    return {
        "code": lobby["code"],
        "status": lobby["status"],
        "size": lobby["size"],
        "mode": lobby["mode"],
        "player_count": len(lobby["players"]),
    }

def compute_leaderboard(lobby):
    players = list(lobby["players"].values())
    players.sort(key=lambda p: (-p["score"], p["misses"]))
    return {
        "players": [
            {
                "name": p["name"],
                "team": p.get("team", ""),
                "score": p["score"],
                "matches": p["matches"],
                "misses": p["misses"],
            }
            for p in players
        ]
    }

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
    return render_template("play.html", code=code.upper())

# -----------------------------
# API
# -----------------------------
@app.post("/api/create")
def create_lobby():
    data = request.get_json(force=True)
    size = int(data.get("size", 6))
    mode = data.get("mode", "solo")

    code = make_code()

    icons = ["🍓","🍒","🍉","🍇","🍑","🥝","🍍","🍌","🍎","🍊","🥥","🫐"]
    pairs = (size * size) // 2
    faces = (icons[:pairs] * 2)
    random.shuffle(faces)

    LOBBIES[code] = {
        "code": code,
        "size": size,
        "mode": mode,
        "status": "waiting",
        "grid": {
            "faces": faces,
            "revealed": [],
            "matched": [],
        },
        "players": {}
    }

    return jsonify({"ok": True, "code": code})

@app.post("/api/join")
def join_lobby():
    data = request.get_json(force=True)
    code = data.get("code","").upper()
    name = data.get("name","Player")

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False})

    pid = str(time.time())

    lobby["players"][pid] = {
        "id": pid,
        "name": name,
        "score": 0,
        "matches": 0,
        "misses": 0,
        "faces": [None] * (lobby["size"] * lobby["size"]),
        "matched": []
    }

    return jsonify({"ok": True, "player_id": pid})

@app.post("/api/start")
def start_game():
    data = request.get_json(force=True)
    code = data.get("code","").upper()
    lobby = LOBBIES.get(code)
    if lobby:
        lobby["status"] = "running"
    return jsonify({"ok": True})

@app.get("/api/state/<code>/<player_id>")
def state(code, player_id):
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False})

    player = lobby["players"].get(player_id)
    if not player:
        return jsonify({"ok": False})

    grid = lobby["grid"]

    faces = []
    for i, f in enumerate(grid["faces"]):
        if i in grid["matched"] or i in grid["revealed"]:
            faces.append(f)
        else:
            faces.append(None)

    return jsonify({
        "ok": True,
        "state": {
            "lobby": public_lobby(lobby),
            "grid": {
                "faces": faces,
                "matched": grid["matched"]
            },
            "player": {
                "name": player["name"],
                "score": player["score"],
                "matches": player["matches"],
                "misses": player["misses"],
            }
        },
        "leaderboard": compute_leaderboard(lobby)
    })

@app.post("/api/flip")
def api_flip():
    data = request.get_json(force=True)
    code = data.get("code","").upper()
    player_id = data.get("player_id")
    idx = int(data.get("idx",-1))

    lobby = LOBBIES.get(code)
    if not lobby or lobby["status"] != "running":
        return jsonify({"ok": False})

    player = lobby["players"].get(player_id)
    if not player:
        return jsonify({"ok": False})

    grid = lobby["grid"]

    if idx in grid["matched"] or idx in grid["revealed"]:
        return jsonify({"ok": True})

    grid["revealed"].append(idx)

    if len(grid["revealed"]) == 2:
        a, b = grid["revealed"]
        if grid["faces"][a] == grid["faces"][b]:
            grid["matched"] += [a, b]
            player["score"] += 10
            player["matches"] += 1
        else:
            player["misses"] += 1
            time.sleep(0.6)
        grid["revealed"].clear()

    return jsonify({"ok": True})
