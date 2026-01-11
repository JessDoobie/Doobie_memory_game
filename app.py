import os
import random
import time
from flask import Flask, jsonify, request, render_template, redirect

app = Flask(__name__)

# ----------------------------
# Config
# ----------------------------
HOST_KEY = os.environ.get("HOST_KEY", "yourSecretKey")
LOBBIES = {}  # code -> lobby dict

EMOJIS = list("🍓🍒🍉🍇🍍🥝🍑🍋🍏🍎🍐🍊🥥🥕🌽🍔🍟🍕🌮🍣🍪🍩🍰🧁🍫🍿🧠🦄🐶🐱🐻🐼🐸🐵🦊🐙🐳🦋🌈⭐️🔥💎🎀🎃🎄🎁🎮🎯🎲🎵🎧🚀🛸")


# ----------------------------
# Helpers
# ----------------------------
def require_host(req) -> bool:
    key = req.headers.get("X-Host-Key", "")
    return bool(key) and key == HOST_KEY


def make_code(n=6) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(n))


def make_player_id() -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(random.choice(alphabet) for _ in range(12))


def normalize_board(rows, cols):
    try:
        rows = int(rows)
        cols = int(cols)
    except Exception:
        return None, None, "Board rows/cols must be numbers."

    tiles = rows * cols
    if tiles % 2 != 0:
        return None, None, "Board must have an even number of tiles (pairs)."
    if tiles < 8:
        return None, None, "Board is too small."
    if tiles > 60:
        return None, None, "Board is too large (max 60 tiles)."

    return rows, cols, None


def build_deck(rows, cols):
    tiles = rows * cols
    pairs = tiles // 2

    pool = EMOJIS[:]
    if pairs > len(pool):
        pool = pool * ((pairs // len(pool)) + 1)

    random.shuffle(pool)
    chosen = pool[:pairs]
    deck = chosen + chosen
    random.shuffle(deck)
    return deck


def player_init_board(p, tiles):
    p["faces"] = [""] * tiles
    p["matched"] = []
    p["pending_hides"] = []
    p["revealed"] = []


def apply_player_pending_hides(player):
    pending = player.get("pending_hides", [])
    if not pending:
        return

    now = time.time()
    faces = player.get("faces", [])
    matched = set(player.get("matched", []))

    keep = []
    for item in pending:
        if now >= item["hide_at"]:
            a = item["a"]
            b = item["b"]
            if 0 <= a < len(faces) and a not in matched:
                faces[a] = ""
            if 0 <= b < len(faces) and b not in matched:
                faces[b] = ""
        else:
            keep.append(item)

    player["pending_hides"] = keep
    player["faces"] = faces


def public_lobby(lobby):
    return {
        "code": lobby["code"],
        "mode": lobby.get("mode", "solo"),
        "entry_mode": lobby.get("entry_mode", "free"),
        "rows": int(lobby.get("rows", 6)),
        "cols": int(lobby.get("cols", 6)),
        "status": lobby.get("status", "waiting"),
        "allow_join": bool(lobby.get("allow_join", True)),
        "player_count": int(lobby.get("player_count", 0)),
        "prizes": lobby.get("prizes", {"1": "", "2": "", "3": ""}),
    }


def compute_leaderboard(lobby):
    players = list(lobby.get("players", {}).values())

    players_sorted = sorted(
        players,
        key=lambda p: (p.get("score", 0), p.get("matches", 0), -p.get("misses", 0)),
        reverse=True
    )

    out_players = []
    for p in players_sorted:
        out_players.append({
            "player_id": p.get("player_id"),
            "name": p.get("name", ""),
            "team": p.get("team", ""),
            "score": p.get("score", 0),
            "matches": p.get("matches", 0),
            "misses": p.get("misses", 0),
        })

    teams_out = []
    if lobby.get("mode") == "teams":
        team_map = {}
        for p in out_players:
            t = (p.get("team") or "").strip() or "Team"
            team_map.setdefault(t, []).append(p)

        for t, members in team_map.items():
            members_sorted = sorted(members, key=lambda x: x["score"], reverse=True)
            top3 = members_sorted[:3]
            score = sum(m["score"] for m in top3)
            teams_out.append({"team": t, "score": score, "members": [m["name"] for m in top3]})

        teams_out.sort(key=lambda x: x["score"], reverse=True)

    return {"players": out_players, "teams": teams_out}


def init_round(lobby):
    rows = int(lobby.get("rows", 6))
    cols = int(lobby.get("cols", 6))
    tiles = rows * cols

    lobby["grid"] = {
        "solution": build_deck(rows, cols)
    }

    lobby["status"] = "waiting"
    lobby["allow_join"] = True

    for p in lobby.get("players", {}).values():
        p["score"] = 0
        p["matches"] = 0
        p["misses"] = 0
        p["finished"] = False
        player_init_board(p, tiles)


# ----------------------------
# Pages
# ----------------------------
@app.route("/")
def home():
    return render_template("home.html")


@app.route("/host")
def host_page():
    return render_template("host.html")


@app.route("/join")
def join_page():
    return render_template("join.html")


@app.route("/play/<code>")
def play_page(code):
    return render_template("play.html", code=code)


@app.route("/watch/<code>")
def watch_page(code):
    return render_template("watch.html", code=code)


# ----------------------------
# Host APIs
# ----------------------------
@app.route("/api/host/create_lobby", methods=["POST"])
def host_create_lobby():
    if not require_host(request):
        return jsonify({"ok": False, "error": "Invalid host key."}), 403

    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "solo")
    entry_mode = data.get("entry_mode", "free")

    rows = data.get("rows", 6)
    cols = data.get("cols", 6)
    rows, cols, err = normalize_board(rows, cols)
    if err:
        return jsonify({"ok": False, "error": err}), 400

    code = make_code(6)
    while code in LOBBIES:
        code = make_code(6)

    lobby = {
        "code": code,
        "mode": mode,
        "entry_mode": entry_mode,
        "rows": rows,
        "cols": cols,
        "created_at": time.time(),
        "status": "waiting",
        "allow_join": True,
        "players": {},
        "player_count": 0,
        "prizes": {"1": "", "2": "", "3": ""}
    }

    init_round(lobby)
    LOBBIES[code] = lobby
    return jsonify({"ok": True, "lobby": public_lobby(lobby)})


@app.route("/api/host/start_round/<code>", methods=["POST"])
def host_start_round(code):
    if not require_host(request):
        return jsonify({"ok": False, "error": "Invalid host key."}), 403

    lobby = LOBBIES.get(code.strip().upper())
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    lobby["status"] = "running"
    lobby["allow_join"] = False
    return jsonify({"ok": True})


@app.route("/api/host/end_round/<code>", methods=["POST"])
def host_end_round(code):
    if not require_host(request):
        return jsonify({"ok": False, "error": "Invalid host key."}), 403

    lobby = LOBBIES.get(code.strip().upper())
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    lobby["status"] = "ended"
    lobby["allow_join"] = False
    return jsonify({"ok": True})


@app.route("/api/host/reset_lobby/<code>", methods=["POST"])
def host_reset_lobby(code):
    if not require_host(request):
        return jsonify({"ok": False, "error": "Invalid host key."}), 403

    lobby = LOBBIES.get(code.strip().upper())
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    init_round(lobby)
    return jsonify({"ok": True})


@app.route("/api/host/set_prizes/<code>", methods=["POST"])
def host_set_prizes(code):
    if not require_host(request):
        return jsonify({"ok": False, "error": "Invalid host key."}), 403

    lobby = LOBBIES.get(code.strip().upper())
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    data = request.get_json(silent=True) or {}
    lobby["prizes"] = {
        "1": (data.get("p1") or "").strip(),
        "2": (data.get("p2") or "").strip(),
        "3": (data.get("p3") or "").strip(),
    }
    return jsonify({"ok": True})


@app.route("/api/host/kick/<code>", methods=["POST"])
def host_kick(code):
    if not require_host(request):
        return jsonify({"ok": False, "error": "Invalid host key."}), 403

    lobby = LOBBIES.get(code.strip().upper())
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    data = request.get_json(silent=True) or {}
    pid = data.get("player_id")
    if pid and pid in lobby["players"]:
        del lobby["players"][pid]
        lobby["player_count"] = len(lobby["players"])
    return jsonify({"ok": True})


# ----------------------------
# Player / Spectator APIs
# ----------------------------
@app.route("/api/join", methods=["POST"])
def api_join():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    name = (data.get("name") or "").strip()[:24]
    team = (data.get("team") or "").strip()[:24]

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    if not lobby.get("allow_join", True):
        return jsonify({"ok": False, "error": "Joining is locked for this round."}), 403

    if lobby.get("player_count", 0) >= 10:
        return jsonify({"ok": False, "error": "Lobby is full (10 max)."}), 403

    if not name:
        return jsonify({"ok": False, "error": "Name required."}), 400

    pid = make_player_id()
    while pid in lobby["players"]:
        pid = make_player_id()

    tiles = int(lobby["rows"]) * int(lobby["cols"])

    p = {
        "player_id": pid,
        "name": name,
        "team": team,
        "score": 0,
        "matches": 0,
        "misses": 0,
        "finished": False,
    }
    player_init_board(p, tiles)

    lobby["players"][pid] = p
    lobby["player_count"] = len(lobby["players"])

    return jsonify({"ok": True, "player_id": pid, "lobby": public_lobby(lobby)})


@app.route("/api/lobby/<code>")
def api_lobby(code):
    code = (code or "").strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    lb = compute_leaderboard(lobby)
    return jsonify({"ok": True, "lobby": public_lobby(lobby), "leaderboard": lb})


@app.route("/api/state/<code>/<player_id>")
def api_state(code, player_id):
    code = (code or "").strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    player = lobby.get("players", {}).get(player_id)
    if not player:
        return jsonify({"ok": False, "error": "Player not found"}), 404

    apply_player_pending_hides(player)

    state = {
        "lobby": public_lobby(lobby),
        "grid": {
            "faces": player.get("faces", []),
            "matched": player.get("matched", [])
        },
        "player": {
            "player_id": player_id,
            "name": player.get("name", ""),
            "team": player.get("team", ""),
            "score": player.get("score", 0),
            "matches": player.get("matches", 0),
            "misses": player.get("misses", 0),
            "finished": player.get("finished", False),
        }
    }

    lb = compute_leaderboard(lobby)
    return jsonify({"ok": True, "state": state, "leaderboard": lb})


@app.route("/api/flip", methods=["POST"])
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

    tiles = int(lobby["rows"]) * int(lobby["cols"])
    if idx < 0 or idx >= tiles:
        return jsonify({"ok": False, "error": "Index out of range"}), 400

    apply_player_pending_hides(player)

    faces = player.get("faces", [""] * tiles)
    matched = set(player.get("matched", []))
    solution = lobby["grid"]["solution"]

    if idx in matched or faces[idx]:
        return jsonify({"ok": True})

    faces[idx] = solution[idx]
    player.setdefault("revealed", [])
    player["revealed"].append(idx)

    if len(player["revealed"]) == 2:
        a, b = player["revealed"][0], player["revealed"][1]
        if a != b and solution[a] == solution[b]:
            matched.add(a); matched.add(b)
            player["matches"] += 1
            player["score"] += 10
        else:
            player["misses"] += 1
            player["score"] -= 1
            player.setdefault("pending_hides", []).append({
                "a": a, "b": b, "hide_at": time.time() + 0.9
            })
        player["revealed"] = []

        if len(matched) >= tiles:
            player["finished"] = True

    player["faces"] = faces
    player["matched"] = sorted(list(matched))

        state = {
        "lobby": public_lobby(lobby),
        "grid": {
            "faces": player.get("faces", []),
            "matched": player.get("matched", [])
        },
        "player": {
            "player_id": player_id,
            "name": player.get("name", ""),
            "team": player.get("team", ""),
            "score": player.get("score", 0),
            "matches": player.get("matches", 0),
            "misses": player.get("misses", 0),
            "finished": player.get("finished", False),
        }
    }
    lb = compute_leaderboard(lobby)
    return jsonify({"ok": True, "state": state, "leaderboard": lb})



if __name__ == "__main__":
    app.run(debug=True)
