import os
import time
import random
import string
from flask import Flask, render_template, request, jsonify, redirect

app = Flask(__name__)

# Secrets
app.secret_key = os.environ.get("FLASK_SECRET", "dev-secret-change-me")
HOST_KEY = os.environ.get("HOST_KEY", "yourSecretKey")

# In-memory lobby store
LOBBIES = {}

# Presets: friendly + phone-friendly
PRESETS = {
    "quick":    {"label": "Quick",    "rows": 4, "cols": 4},  # 16
    "standard": {"label": "Standard", "rows": 5, "cols": 4},  # 20
    "extended": {"label": "Extended", "rows": 6, "cols": 4},  # 24
}

EMOJIS = list("🍓🍒🍇🍉🍍🥝🍑🍋🍭🍪🍩🍫🧁🍬🍡🍦🥥🍌🍏🍎🍊🥑🍔🍟🍕🌮🌯🍜🍣🍤🥨🧀")

def make_code(n=5):
    return "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(n))

def build_deck(total_cards):
    # total_cards must be even
    pairs = total_cards // 2
    picks = random.sample(EMOJIS, k=min(pairs, len(EMOJIS)))
    # If we ever need more pairs than emojis, repeat (unlikely here)
    while len(picks) < pairs:
        picks.append(random.choice(EMOJIS))
    deck = picks + picks
    random.shuffle(deck)
    return deck

def leaderboard(lobby):
    players = []
    for pid, p in lobby["players"].items():
        players.append({
            "id": pid,
            "name": p["name"],
            "team": p.get("team") or "",
            "score": p["score"],
            "matches": p["matches"],
            "misses": p["misses"],
        })
    players.sort(key=lambda x: (-x["score"], x["misses"], x["name"].lower()))

    out = {"players": players}

    if lobby["mode"] == "teams":
        # Sum top 3 scores per team
        teams = {}
        for r in players:
            team = r["team"] or "—"
            teams.setdefault(team, []).append(r)
        team_rows = []
        for team, members in teams.items():
            members_sorted = sorted(members, key=lambda x: (-x["score"], x["misses"]))
            top3 = members_sorted[:3]
            team_rows.append({
                "team": team,
                "score": sum(m["score"] for m in top3),
                "members": [m["name"] for m in top3]
            })
        team_rows.sort(key=lambda x: -x["score"])
        out["teams"] = team_rows

    return out

@app.route("/")
def home():
    return render_template("home.html")

@app.route("/join")
def join_page():
    return render_template("join.html")

@app.route("/host")
def host_page():
    # Secret host link option: /host?host_key=XXXX
    hk = request.args.get("host_key", "")
    if hk != HOST_KEY:
        # no host key: still show page, but form can be gated in template if you want
        pass
    return render_template("host.html")

@app.route("/play/<code>")
def play_page(code):
    code = (code or "").strip().upper()
    return render_template("play.html", code=code)

@app.route("/watch/<code>")
def watch_page(code):
    # Simple spectator view uses same template as play, but we will not create a player.
    # For now, this just shows the board state (no clicking) using watch.html if you have it.
    code = (code or "").strip().upper()
    return render_template("watch.html", code=code)

# ---------- API ----------

@app.route("/api/create_lobby", methods=["POST"])
def api_create_lobby():
    data = request.get_json(silent=True) or {}
    mode = (data.get("mode") or "solo").strip().lower()
    preset = (data.get("preset") or "standard").strip().lower()
    entry = (data.get("entry") or "free").strip().lower()

    if preset not in PRESETS:
        preset = "standard"

    rows = PRESETS[preset]["rows"]
    cols = PRESETS[preset]["cols"]
    total = rows * cols
    if total % 2 != 0:
        return jsonify({"ok": False, "error": "Board must have an even number of cards."}), 400

    code = make_code(5)
    deck = build_deck(total)

    LOBBIES[code] = {
        "code": code,
        "created_at": time.time(),
        "mode": "teams" if mode == "teams" else "solo",
        "status": "waiting",          # waiting | running | ended
        "join_locked": False,
        "entry": "paid" if entry == "paid" else "free",
        "preset": preset,
        "preset_label": PRESETS[preset]["label"],
        "rows": rows,
        "cols": cols,
        "total": total,
        "deck": deck,                # full answer key deck (server only)
        "players": {},               # player_id -> player state
    }

    return jsonify({
        "ok": True,
        "code": code,
        "preset": preset,
        "preset_label": PRESETS[preset]["label"],
        "rows": rows,
        "cols": cols,
        "total": total
    })

@app.route("/api/start", methods=["POST"])
def api_start():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    lobby["status"] = "running"
    lobby["join_locked"] = True
    return jsonify({"ok": True})

@app.route("/api/join", methods=["POST"])
def api_join():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    name = (data.get("name") or "Player").strip()[:18]
    team = (data.get("team") or "").strip()[:14]

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    if lobby.get("join_locked"):
        return jsonify({"ok": False, "error": "Joining is locked (game already started)."}), 400

    if len(lobby["players"]) >= 10:
        return jsonify({"ok": False, "error": "Lobby is full (10 max)."}), 400

    pid = make_code(10)
    total = lobby["total"]

    lobby["players"][pid] = {
        "id": pid,
        "name": name,
        "team": team if lobby["mode"] == "teams" else "",
        "score": 0,
        "matches": 0,
        "misses": 0,
        "finished": False,
        "revealed": [None] * total,     # what player currently sees
        "matched": set(),               # matched indices
        "picks": [],                    # current 0-2 picks
        "hide_at": None,                # when to hide mismatched picks
        "pending_hide": [],             # indices to hide when hide_at passes
    }

    return jsonify({"ok": True, "player_id": pid})

@app.route("/api/state/<code>/<player_id>")
def api_state(code, player_id):
    code = (code or "").strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    player = lobby["players"].get(player_id)
    if not player:
        return jsonify({"ok": False, "error": "Player not found"}), 404

    # If mismatch timer expired, hide them now
    if player["hide_at"] and time.time() >= player["hide_at"]:
        for i in player["pending_hide"]:
            if i not in player["matched"]:
                player["revealed"][i] = None
        player["pending_hide"] = []
        player["hide_at"] = None
        player["picks"] = []

    state = {
        "lobby": {
            "code": lobby["code"],
            "mode": lobby["mode"],
            "status": lobby["status"],
            "join_locked": lobby["join_locked"],
            "player_count": len(lobby["players"]),
            "rows": lobby["rows"],
            "cols": lobby["cols"],
            "preset": lobby["preset"],
            "preset_label": lobby["preset_label"],
        },
        "grid": {
            "faces": player["revealed"],
            "matched": sorted(list(player["matched"]))
        },
        "player": {
            "id": player["id"],
            "name": player["name"],
            "team": player.get("team") or "",
            "score": player["score"],
            "matches": player["matches"],
            "misses": player["misses"],
            "finished": player["finished"]
        }
    }

    return jsonify({"ok": True, "state": state, "leaderboard": leaderboard(lobby)})

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

    total = lobby["total"]
    if idx is None or not isinstance(idx, int) or idx < 0 or idx >= total:
        return jsonify({"ok": False, "error": "Bad tile index"}), 400

    # If mismatch timer is active, ignore flips until hidden
    if player["hide_at"]:
        return jsonify({"ok": True, "state": _state_for_return(lobby, player)})

    # Ignore if already matched or already revealed
    if idx in player["matched"] or player["revealed"][idx]:
        return jsonify({"ok": True, "state": _state_for_return(lobby, player)})

    # Reveal
    player["revealed"][idx] = lobby["deck"][idx]
    player["picks"].append(idx)

    if len(player["picks"]) == 2:
        a, b = player["picks"]
        if lobby["deck"][a] == lobby["deck"][b]:
            # Match!
            player["matched"].add(a)
            player["matched"].add(b)
            player["matches"] += 1
            player["score"] += 10
            player["picks"] = []
        else:
            # Miss - keep them visible briefly, then hide
            player["misses"] += 1
            player["score"] -= 1
            player["pending_hide"] = [a, b]
            # Slightly faster flip-back (you can tune this)
            player["hide_at"] = time.time() + 0.45

    # Finished?
    if len(player["matched"]) == total:
        player["finished"] = True

    return jsonify({"ok": True, "state": _state_for_return(lobby, player)})

def _state_for_return(lobby, player):
    return {
        "lobby": {
            "code": lobby["code"],
            "mode": lobby["mode"],
            "status": lobby["status"],
            "join_locked": lobby["join_locked"],
            "player_count": len(lobby["players"]),
            "rows": lobby["rows"],
            "cols": lobby["cols"],
            "preset": lobby["preset"],
            "preset_label": lobby["preset_label"],
        },
        "grid": {
            "faces": player["revealed"],
            "matched": sorted(list(player["matched"]))
        },
        "player": {
            "id": player["id"],
            "name": player["name"],
            "team": player.get("team") or "",
            "score": player["score"],
            "matches": player["matches"],
            "misses": player["misses"],
            "finished": player["finished"]
        }
    }

if __name__ == "__main__":
    app.run(debug=True)
