import time, random, string
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
import os
import random
import string
from flask import request, jsonify

# If you already have these globals, DON'T duplicate them — keep one copy.
# If you don't have them, keep these:
try:
    LOBBIES
except NameError:
    LOBBIES = {}

HOST_KEY = os.environ.get("HOST_KEY", "yourSecretKey")  # should match your Render env var

def _new_code(n=5):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no O/0/I/1
    return "".join(random.choice(alphabet) for _ in range(n))

def _board_preset(board_name: str):
    # These match the dropdown values in host.html
    if board_name == "extended":
        return (4, 6)  # 24 cards
    return (4, 5)      # standard 20 cards

def _make_faces(total_cards: int):
    # total_cards MUST be even
    EMOJIS = ["🍓","🍇","🍒","🍉","🍍","🥝","🍑","🍋","🍊","🥥","🫐","🍏",
              "🐱","🐶","🦊","🐻","🐼","🐸","🐵","🐰","🦄","🐙","🦋","🐝",
              "⭐","🌙","☁️","🔥","🍀","🌈","💎","🎀","🎲","🎯","🎮","🎧"]
    need_pairs = total_cards // 2
    pool = EMOJIS[:]
    random.shuffle(pool)
    chosen = pool[:need_pairs]
    faces = chosen + chosen
    random.shuffle(faces)
    return faces

@app.route("/api/create", methods=["POST"])
def api_create():
    data = request.get_json(silent=True) or {}

    # If you want to require host_key for create:
    hk = (data.get("host_key") or "").strip()
    if HOST_KEY and hk != HOST_KEY:
        return jsonify({"ok": False, "error": "Bad host key"}), 403

    mode = (data.get("mode") or "solo").strip().lower()
    board = (data.get("board") or "standard").strip().lower()
    entry = (data.get("entry") or "free").strip().lower()

    rows, cols = _board_preset(board)
    total = rows * cols
    if total % 2 != 0:
        return jsonify({"ok": False, "error": "Board must have an even number of cards"}), 400

    code = _new_code()
    while code in LOBBIES:
        code = _new_code()

    LOBBIES[code] = {
        "code": code,
        "mode": mode,              # "solo" or "teams"
        "entry": entry,            # "free" or "paid"
        "rows": rows,
        "cols": cols,
        "status": "waiting",       # waiting -> running -> ended
        "join_locked": False,
        "faces": _make_faces(total),
        "revealed": {},            # player_id -> set(indexes currently revealed)
        "matched": set(),          # global matched indexes (leaderboard-only version still ok)
        "players": {},             # player_id -> player stats
    }

    return jsonify({"ok": True, "code": code, "rows": rows, "cols": cols, "mode": mode, "entry": entry})

@app.route("/api/start", methods=["POST"])
def api_start():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()

    hk = (data.get("host_key") or "").strip()
    if HOST_KEY and hk != HOST_KEY:
        return jsonify({"ok": False, "error": "Bad host key"}), 403

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    lobby["status"] = "running"
    lobby["join_locked"] = True
    return jsonify({"ok": True})

LOBBIES = {}

PRESETS = {
    "quick":    {"rows":4, "cols":4},
    "standard": {"rows":5, "cols":4},
    "extended": {"rows":6, "cols":4},
}

EMOJIS = list("🍓🍒🍇🍉🍍🥝🍑🍋🍪🍩🍫🧁🍬🍡🍦🥥🍌🍏🍎🍊")

def make_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=5))

def build_deck(n):
    pairs = n // 2
    picks = random.sample(EMOJIS, pairs)
    deck = picks + picks
    random.shuffle(deck)
    return deck

@app.route("/")
def home(): return render_template("home.html")

@app.route("/host")
def host(): return render_template("host.html")

@app.route("/join")
def join(): return render_template("join.html")

@app.route("/play/<code>")
def play(code): return render_template("play.html", code=code)

@app.post("/api/create_lobby")
def create():
    data = request.json or {}
    preset = data.get("preset","standard")
    p = PRESETS[preset]

    total = p["rows"] * p["cols"]
    code = make_code()

    LOBBIES[code] = {
        "rows": p["rows"],
        "cols": p["cols"],
        "deck": build_deck(total),
        "players": {},
        "status": "waiting",
    }

    return jsonify(ok=True, code=code)

@app.post("/api/start")
def start():
    code = request.json.get("code")
    LOBBIES[code]["status"] = "running"
    return jsonify(ok=True)

@app.post("/api/join")
def join_api():
    data = request.json
    code = data["code"]
    pid = make_code()
    lobby = LOBBIES[code]
    total = lobby["rows"] * lobby["cols"]

    lobby["players"][pid] = {
        "name": data.get("name","Player"),
        "revealed": [None]*total,
        "matched": set(),
        "picks": [],
        "hide_at": None,
        "score": 0,
        "matches": 0,
        "misses": 0,
    }

    return jsonify(ok=True, player_id=pid)

@app.get("/api/state/<code>/<pid>")
def state(code, pid):
    code = (code or "").strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False, error="Lobby not found"), 404

    p = lobby.get("players", {}).get(pid)
    if not p:
        return jsonify(ok=False, error="Player not found"), 404

    if p.get("hide_at") and time.time() >= p["hide_at"]:
        for i in p.get("picks", []):
            if i not in p.get("matched", set()):
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
            },
            "grid": {
                "faces": p["revealed"],
                "matched": list(p.get("matched", set())),
            },
            "player": {
                "name": p["name"],
                "score": p["score"],
                "matches": p.get("matches", 0),
                "misses": p.get("misses", 0),
            }
        },
        leaderboard={
            "players": [
                {
                    "name": v.get("name", "Player"),
                    "score": int(v.get("score", 0)),
                    "matches": int(v.get("matches", 0)),
                    "misses": int(v.get("misses", 0)),
                }
                for v in lobby["players"].values()
            ]
        }
    )



@app.post("/api/flip")
def flip():
    data = request.get_json(silent=True) or {}

    code = (data.get("code") or "").strip().upper()
    pid  = data.get("player_id") or data.get("playerId")
    idx  = data.get("idx")

    # Cast idx safely (phones sometimes send it as a string)
    try:
        idx = int(idx)
    except Exception:
        return jsonify(ok=False, error="Bad tile index"), 400

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False, error="Lobby not found"), 404

    if lobby.get("status") != "running":
        return jsonify(ok=False, error="Round not running"), 400

    players = lobby.get("players", {})
    p = players.get(pid)
    if not p:
        return jsonify(ok=False, error="Player not found"), 404

    faces = lobby.get("faces")
    if not faces:
        return jsonify(ok=False, error="Lobby faces missing"), 500

    total = len(faces)

    # Ensure player's arrays exist and match board size
    if not p.get("revealed") or len(p["revealed"]) != total:
        p["revealed"] = [None] * total
    if not p.get("picks"):
        p["picks"] = []
    if not p.get("matched"):
        p["matched"] = set()

# Ignore invalid indexes
if idx < 0 or idx >= total:
    return jsonify(ok=False, error="Tile out of range"), 400

# Ignore clicks on already matched / already revealed tile
if idx in p["matched"] or p["revealed"][idx]:
    return jsonify(ok=True)

# If we're waiting to flip mismatched cards back, ignore new flips
if p.get("hide_at") and time.time() < p["hide_at"]:
    return jsonify(ok=False, error="Wait for cards to flip back…")

# Reveal this tile
p["revealed"][idx] = faces[idx]
p["picks"].append(idx)


    # If two picks, resolve match/miss
    if len(p["picks"]) == 2:
        a, b = p["picks"]
        if faces[a] == faces[b]:
            p["matched"].update([a, b])
            p["score"] = int(p.get("score", 0)) + 10
            p["matches"] = int(p.get("matches", 0)) + 1
            p["picks"] = []
            p["hide_at"] = None
        else:
            p["misses"] = int(p.get("misses", 0)) + 1
            # Keep revealed briefly; /api/state should hide them when time passes
            p["hide_at"] = time.time() + 0.40  # slightly faster than 0.45
            # Keep picks until hide occurs

    return jsonify(ok=True)
