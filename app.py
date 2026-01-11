import os
import time
import random
import string
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

LOBBIES = {}

# -----------------------------
# Helpers
# -----------------------------
def make_code(n=5):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))

def compute_leaderboard(lobby):
    players = list(lobby["players"].values())
    players.sort(key=lambda p: (-p["score"], p["misses"], p["name"].lower()))
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

def public_lobby(lobby):
    return {
        "code": lobby["code"],
        "status": lobby["status"],
        "size": lobby["size"],
        "mode": lobby["mode"],
        "player_count": len(lobby["players"]),
        "max_players": lobby["max_players"],
    }

def build_player_faces(lobby_faces, revealed_set, matched_set):
    # Return a list of faces with hidden cards as None
    out = []
    for i, f in enumerate(lobby_faces):
        if i in matched_set or i in revealed_set:
            out.append(f)
        else:
            out.append(None)
    return out

# -----------------------------
# Pages
# -----------------------------
@app.get("/")
def home():
    return render_template("home.html")

@app.get("/host")
def host():
    return render_template("host.html")

@app.get("/join")
def join():
    return render_template("join.html")

@app.get("/play/<code>")
def play(code):
    return render_template("play.html", code=code.upper())

# -----------------------------
# API
# -----------------------------
@app.post("/api/create")
def api_create():
    data = request.get_json(silent=True) or {}
    size = int(data.get("size", 6))
    mode = (data.get("mode") or "solo").strip().lower()
    max_players = int(data.get("max_players", 10))

    if size not in (4, 6):
        size = 6
    if mode not in ("solo", "teams"):
        mode = "solo"
    if max_players < 1:
        max_players = 10
    if max_players > 10:
        max_players = 10

    code = make_code(5)

    # Enough unique emojis for 6x6 (18 pairs)
    icons = [
        "🍓","🍒","🍉","🍇","🍑","🥝","🍍","🍌","🍎","🍊",
        "🫐","🥥","🍋","🍐","🥭","🍈","🍏","🍔","🍟","🍕",
        "🌮","🍦","🍩","🍪","🧁","🍫","🍬","🍿","🥨","🧋"
    ]

    tiles = size * size
    pairs = tiles // 2
    deck = (icons[:pairs] * 2)
    random.shuffle(deck)

    LOBBIES[code] = {
        "code": code,
        "size": size,
        "mode": mode,
        "status": "waiting",  # waiting | running | ended
        "max_players": max_players,
        "faces": deck,        # shared order
        "players": {},        # per-player state
        "created_at": time.time(),
    }

    return jsonify({"ok": True, "code": code})

@app.post("/api/start")
def api_start():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    lobby["status"] = "running"
    return jsonify({"ok": True})

@app.post("/api/join")
def api_join():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    name = (data.get("name") or "Player").strip()
    team = (data.get("team") or "").strip()

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    if len(lobby["players"]) >= lobby["max_players"]:
        return jsonify({"ok": False, "error": "Lobby full"}), 400

    # Allow joining even while waiting; also allow during running if you want.
    # If you want to lock joining once running, uncomment this:
    # if lobby["status"] != "waiting":
    #     return jsonify({"ok": False, "error": "Joining locked"}), 400

    # player id
    pid = make_code(10)

    lobby["players"][pid] = {
        "id": pid,
        "name": name[:20] if name else "Player",
        "team": team[:16] if team else "",
        "score": 0,
        "matches": 0,
        "misses": 0,
        "revealed": [],          # indices currently face-up (max 2)
        "matched": set(),        # indices matched
        "hide_at": 0.0,          # timestamp to auto-hide mismatch
    }

    return jsonify({"ok": True, "player_id": pid})

@app.get("/api/state/<code>/<player_id>")
def api_state(code, player_id):
    code = (code or "").strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    player = lobby["players"].get(player_id)
    if not player:
        return jsonify({"ok": False, "error": "Player not found"}), 404

    # Auto-hide mismatches after delay (without blocking server)
    now = time.time()
    if player["hide_at"] and now >= player["hide_at"]:
        player["revealed"] = []
        player["hide_at"] = 0.0

    revealed_set = set(player["revealed"])
    matched_set = set(player["matched"])

    faces = build_player_faces(lobby["faces"], revealed_set, matched_set)

    state = {
        "lobby": public_lobby(lobby),
        "grid": {
            "faces": faces,
            "matched": sorted(list(matched_set)),
        },
        "player": {
            "player_id": player["id"],
            "name": player["name"],
            "team": player.get("team", ""),
            "score": player["score"],
            "matches": player["matches"],
            "misses": player["misses"],
            "finished": (len(matched_set) == (lobby["size"] * lobby["size"])),
        }
    }

    return jsonify({"ok": True, "state": state, "leaderboard": compute_leaderboard(lobby)})

@app.post("/api/flip")
def api_flip():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    player_id = data.get("player_id")
    idx = data.get("idx")

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    if lobby.get("status") != "running":
        return jsonify({"ok": False, "error": "Round not running"}), 400

    player = lobby.get("players", {}).get(player_id)
    if not player:
        return jsonify({"ok": False, "error": "Player not found"}), 404

    try:
        idx = int(idx)
    except Exception:
        return jsonify({"ok": False, "error": "Bad index"}), 400

    tiles = lobby["size"] * lobby["size"]
    if idx < 0 or idx >= tiles:
        return jsonify({"ok": False, "error": "Index out of range"}), 400

    # If mismatch hide timer passed, clear it now
    now = time.time()
    if player["hide_at"] and now >= player["hide_at"]:
        player["revealed"] = []
        player["hide_at"] = 0.0

    matched = player["matched"]
    revealed = player["revealed"]

    # Ignore taps on matched or already revealed
    if idx in matched or idx in revealed:
        # Return state immediately
        return api_state(code, player_id)

    # If already have 2 revealed and hide_at not reached, ignore taps
    if len(revealed) >= 2 and player["hide_at"] and now < player["hide_at"]:
        return api_state(code, player_id)

    revealed.append(idx)

    # If 2 revealed -> check match
    if len(revealed) == 2:
        a, b = revealed[0], revealed[1]
        if lobby["faces"][a] == lobby["faces"][b]:
            matched.add(a)
            matched.add(b)
            player["score"] += 10
            player["matches"] += 1
            # clear immediately on match
            player["revealed"] = []
            player["hide_at"] = 0.0
        else:
            player["misses"] += 1
            # keep them revealed for a short time, then auto-hide in /api/state
            player["hide_at"] = time.time() + 0.65

    # Return updated state + leaderboard immediately
    revealed_set = set(player["revealed"])
    matched_set = set(player["matched"])
    faces = build_player_faces(lobby["faces"], revealed_set, matched_set)

    state = {
        "lobby": public_lobby(lobby),
        "grid": {
            "faces": faces,
            "matched": sorted(list(matched_set)),
        },
        "player": {
            "player_id": player["id"],
            "name": player["name"],
            "team": player.get("team", ""),
            "score": player["score"],
            "matches": player["matches"],
            "misses": player["misses"],
            "finished": (len(matched_set) == (lobby["size"] * lobby["size"])),
        }
    }

    return jsonify({"ok": True, "state": state, "leaderboard": compute_leaderboard(lobby)})

if __name__ == "__main__":
    app.run(debug=True)
