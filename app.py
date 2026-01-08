import os
import time
import uuid
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from flask import Flask, render_template, request, jsonify, redirect, url_for, abort

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", "dev-secret-change-me")

# -----------------------------
# In-memory storage (simple demo)
# NOTE: If Render restarts, lobbies reset. For persistence, you'd use Redis/DB.
# -----------------------------
LOBBIES: Dict[str, "Lobby"] = {}

MAX_PLAYERS = 10
PAIR_SCORE = 10
MISS_PENALTY = 1

# Set these in Render Environment Variables
HOST_KEY = os.environ.get("HOST_KEY", "letmein")


def now_ms() -> int:
    return int(time.time() * 1000)


def clean_name(s: str) -> str:
    s = (s or "").strip()
    s = "".join(ch for ch in s if ch.isprintable())
    return s[:20] if s else "Player"


def clean_team(s: str) -> str:
    s = (s or "").strip()
    s = "".join(ch for ch in s if ch.isprintable())
    return s[:16]


def make_code(n=6) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(n))


# -------- Tickets --------
TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def make_ticket(n=10) -> str:
    return "".join(random.choice(TICKET_ALPHABET) for _ in range(n))


def generate_board(seed: int, size: int) -> List[str]:
    """
    Returns a flattened list of card faces (strings) of length size*size.
    Faces are paired. Same seed => same board.
    """
    rng = random.Random(seed)
    total = size * size
    assert total % 2 == 0, "Board size must be even number of cards"

    emoji_pool = [
        "🍒","🍋","🍉","🍇","🍓","🍑","🍍","🥝","🍏","🍎","🍊","🥥",
        "🧁","🍩","🍪","🍰","🍫","🍬","🍭","🍿","🧋","☕","🥨","🧀",
        "🐶","🐱","🐼","🦊","🐸","🐵","🦄","🐙","🦋","🐝","🐢","🦖",
        "⭐","🌙","⚡","🔥","🌈","❄️","🍀","🌸","🌵","🌊","🎈","🎁",
        "🎮","🎲","🎧","🎸","🎨","🏆","⚽","🏀","🎯","🚀","🛸","🧠"
    ]
    pairs_needed = total // 2
    faces = emoji_pool[:]
    rng.shuffle(faces)
    faces = faces[:pairs_needed]

    cards = faces + faces
    rng.shuffle(cards)
    return cards


@dataclass
class PlayerState:
    player_id: str
    name: str
    team: str = ""
    joined_ms: int = field(default_factory=now_ms)

    score: int = 0
    matches: int = 0
    misses: int = 0
    flips: int = 0
    finished_ms: Optional[int] = None

    first_idx: Optional[int] = None
    second_idx: Optional[int] = None

    revealed: Dict[int, int] = field(default_factory=dict)  # idx -> reveal_until_ms
    matched: set = field(default_factory=set)

    def is_finished(self, total_pairs: int) -> bool:
        return self.matches >= total_pairs


@dataclass
class Lobby:
    code: str
    mode: str = "solo"        # solo | teams
    size: int = 6             # 4 or 6
    created_ms: int = field(default_factory=now_ms)

    status: str = "waiting"   # waiting | running | ended
    seed: int = field(default_factory=lambda: random.randint(1, 2_000_000_000))
    board: List[str] = field(default_factory=list)

    started_ms: Optional[int] = None
    ended_ms: Optional[int] = None

    players: Dict[str, PlayerState] = field(default_factory=dict)

    allow_join: bool = True

    # NEW: Entry mode per lobby
    entry_mode: str = "free"  # free | ticket

    # NEW: Single-use tickets for this lobby: ticket_code -> used?
    tickets: Dict[str, bool] = field(default_factory=dict)

    def total_pairs(self) -> int:
        return (self.size * self.size) // 2

    def ensure_board(self):
        if not self.board:
            self.board = generate_board(self.seed, self.size)


def require_host(req) -> None:
    key = req.headers.get("X-Host-Key") or req.args.get("host_key") or ""
    if key != HOST_KEY:
        abort(403)


def lobby_public_state(lobby: Lobby):
    lobby.ensure_board()
    return {
        "code": lobby.code,
        "mode": lobby.mode,
        "size": lobby.size,
        "status": lobby.status,
        "seed": lobby.seed,
        "started_ms": lobby.started_ms,
        "ended_ms": lobby.ended_ms,
        "max_players": MAX_PLAYERS,
        "player_count": len(lobby.players),
        "allow_join": lobby.allow_join,
        "entry_mode": lobby.entry_mode,  # NEW
    }


def leaderboard(lobby: Lobby):
    total_pairs = lobby.total_pairs()

    rows = []
    for p in lobby.players.values():
        finished = p.is_finished(total_pairs)
        finish_time_ms = None
        if p.finished_ms and lobby.started_ms:
            finish_time_ms = max(0, p.finished_ms - lobby.started_ms)

        rows.append({
            "player_id": p.player_id,
            "name": p.name,
            "team": p.team,
            "score": p.score,
            "matches": p.matches,
            "misses": p.misses,
            "flips": p.flips,
            "finished": finished,
            "finish_time_ms": finish_time_ms,
        })

    def sort_key(r):
        finished_rank = 0 if r["finished"] else 1
        finish_time = r["finish_time_ms"] if r["finish_time_ms"] is not None else 10**12
        return (-r["score"], finished_rank, finish_time, r["misses"], r["flips"], r["name"].lower())

    rows.sort(key=sort_key)

    team_scores = {}
    if lobby.mode == "teams":
        by_team = {}
        for r in rows:
            t = (r["team"] or "Team").strip() or "Team"
            by_team.setdefault(t, []).append(r)

        for t, members in by_team.items():
            top3 = sorted(members, key=lambda r: (-r["score"], r["misses"], r["flips"]))[:3]
            team_scores[t] = {
                "team": t,
                "score": sum(m["score"] for m in top3),
                "members": [m["name"] for m in top3],
            }

        team_scores = dict(sorted(team_scores.items(), key=lambda kv: -kv[1]["score"]))

    return {"players": rows, "teams": list(team_scores.values())}


def player_view_state(lobby: Lobby, player: PlayerState):
    lobby.ensure_board()
    total = lobby.size * lobby.size

    # expire timed reveals
    t = now_ms()
    expired = [idx for idx, until in player.revealed.items() if until <= t]
    for idx in expired:
        if idx not in player.matched:
            player.revealed.pop(idx, None)

    visible = [False] * total
    for idx in player.matched:
        if 0 <= idx < total:
            visible[idx] = True
    for idx in player.revealed.keys():
        if 0 <= idx < total:
            visible[idx] = True

    faces = [lobby.board[i] if visible[i] else None for i in range(total)]

    return {
        "player": {
            "player_id": player.player_id,
            "name": player.name,
            "team": player.team,
            "score": player.score,
            "matches": player.matches,
            "misses": player.misses,
            "flips": player.flips,
            "finished": player.is_finished(lobby.total_pairs()),
        },
        "lobby": lobby_public_state(lobby),
        "grid": {
            "faces": faces,
            "matched": sorted(list(player.matched)),
        }
    }


# -----------------------------
# Pages
# -----------------------------
@app.route("/")
def home():
    return render_template("home.html")


# SECRET host link protection:
# /host without ?host_key=YOURKEY -> redirect home
@app.route("/host")
def host_page():
    key = request.args.get("host_key")
    if key != HOST_KEY:
        return redirect(url_for("home"))
    return render_template("host.html")


@app.route("/join")
def join_page():
    return render_template("join.html")


@app.route("/play/<code>")
def play_page(code):
    code = code.strip().upper()
    if code not in LOBBIES:
        return redirect(url_for("join_page"))
    return render_template("play.html", code=code)


# -----------------------------
# API (Host)
# -----------------------------
@app.route("/api/host/create_lobby", methods=["POST"])
def api_create_lobby():
    require_host(request)
    data = request.get_json(force=True) or {}

    mode = (data.get("mode") or "solo").strip().lower()
    size = int(data.get("size") or 6)
    entry_mode = (data.get("entry_mode") or "free").strip().lower()  # NEW

    if mode not in ("solo", "teams"):
        mode = "solo"
    if size not in (4, 6):
        size = 6
    if entry_mode not in ("free", "ticket"):
        entry_mode = "free"

    code = make_code()
    while code in LOBBIES:
        code = make_code()

    lobby = Lobby(code=code, mode=mode, size=size, entry_mode=entry_mode)
    lobby.ensure_board()
    LOBBIES[code] = lobby

    return jsonify({"ok": True, "lobby": lobby_public_state(lobby)})


@app.route("/api/host/generate_tickets/<code>", methods=["POST"])
def api_generate_tickets(code):
    require_host(request)
    code = code.strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    data = request.get_json(force=True) or {}
    count = int(data.get("count") or 10)
    count = max(1, min(100, count))  # safety cap

    new_codes = []
    for _ in range(count):
        t = make_ticket(10)
        while t in lobby.tickets:
            t = make_ticket(10)
        lobby.tickets[t] = False  # unused
        new_codes.append(t)

    return jsonify({"ok": True, "tickets": new_codes, "total": len(lobby.tickets)})


@app.route("/api/host/start_round/<code>", methods=["POST"])
def api_start_round(code):
    require_host(request)
    code = code.strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    if lobby.status == "running":
        return jsonify({"ok": True, "lobby": lobby_public_state(lobby)})

    lobby.status = "running"
    lobby.started_ms = now_ms()
    lobby.ended_ms = None
    lobby.allow_join = False
    lobby.ensure_board()

    for p in lobby.players.values():
        p.score = 0
        p.matches = 0
        p.misses = 0
        p.flips = 0
        p.finished_ms = None
        p.first_idx = None
        p.second_idx = None
        p.revealed.clear()
        p.matched.clear()

    return jsonify({"ok": True, "lobby": lobby_public_state(lobby)})


@app.route("/api/host/end_round/<code>", methods=["POST"])
def api_end_round(code):
    require_host(request)
    code = code.strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    lobby.status = "ended"
    lobby.ended_ms = now_ms()
    return jsonify({"ok": True, "lobby": lobby_public_state(lobby), "leaderboard": leaderboard(lobby)})


@app.route("/api/host/reset_lobby/<code>", methods=["POST"])
def api_reset_lobby(code):
    require_host(request)
    code = code.strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    lobby.status = "waiting"
    lobby.allow_join = True
    lobby.seed = random.randint(1, 2_000_000_000)
    lobby.board = generate_board(lobby.seed, lobby.size)
    lobby.started_ms = None
    lobby.ended_ms = None

    for p in lobby.players.values():
        p.score = 0
        p.matches = 0
        p.misses = 0
        p.flips = 0
        p.finished_ms = None
        p.first_idx = None
        p.second_idx = None
        p.revealed.clear()
        p.matched.clear()

    return jsonify({"ok": True, "lobby": lobby_public_state(lobby)})


# -----------------------------
# API (Public)
# -----------------------------
@app.route("/api/lobby/<code>", methods=["GET"])
def api_get_lobby(code):
    code = code.strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404
    return jsonify({"ok": True, "lobby": lobby_public_state(lobby), "leaderboard": leaderboard(lobby)})


@app.route("/api/join", methods=["POST"])
def api_join():
    data = request.get_json(force=True) or {}
    code = (data.get("code") or "").strip().upper()
    name = clean_name(data.get("name") or "")
    team = clean_team(data.get("team") or "")
    ticket = (data.get("ticket") or "").strip().upper()  # NEW

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    if not lobby.allow_join or lobby.status != "waiting":
        return jsonify({"ok": False, "error": "Lobby already started"}), 400

    if len(lobby.players) >= MAX_PLAYERS:
        lobby.allow_join = False  # auto-lock if full
        return jsonify({"ok": False, "error": "Lobby is full (10 max)"}), 400

    if lobby.mode != "teams":
        team = ""

    # Ticket enforcement (only if lobby requires it)
    if lobby.entry_mode == "ticket":
        if not ticket:
            return jsonify({"ok": False, "error": "Ticket code required"}), 400
        if ticket not in lobby.tickets:
            return jsonify({"ok": False, "error": "Invalid ticket code"}), 400
        if lobby.tickets[ticket] is True:
            return jsonify({"ok": False, "error": "Ticket already used"}), 400

        # Mark ticket as used
        lobby.tickets[ticket] = True

    player_id = "pl_" + uuid.uuid4().hex[:10]
    lobby.players[player_id] = PlayerState(player_id=player_id, name=name, team=team)

    # Auto-lock when it reaches 10 players
    if len(lobby.players) >= MAX_PLAYERS:
        lobby.allow_join = False

    return jsonify({"ok": True, "player_id": player_id, "play_url": url_for("play_page", code=code)})


@app.route("/api/state/<code>/<player_id>", methods=["GET"])
def api_player_state(code, player_id):
    code = code.strip().upper()
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404

    player = lobby.players.get(player_id)
    if not player:
        return jsonify({"ok": False, "error": "Player not found"}), 404

    return jsonify({"ok": True, "state": player_view_state(lobby, player), "leaderboard": leaderboard(lobby)})


@app.route("/api/flip", methods=["POST"])
def api_flip():
    data = request.get_json(force=True) or {}
    code = (data.get("code") or "").strip().upper()
    player_id = (data.get("player_id") or "").strip()
    idx = int(data.get("idx"))

    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify({"ok": False, "error": "Lobby not found"}), 404
    player = lobby.players.get(player_id)
    if not player:
        return jsonify({"ok": False, "error": "Player not found"}), 404

    lobby.ensure_board()

    if lobby.status != "running":
        return jsonify({"ok": False, "error": "Round not running"}), 400

    total = lobby.size * lobby.size
    if idx < 0 or idx >= total:
        return jsonify({"ok": False, "error": "Bad index"}), 400

    if idx in player.matched:
        return jsonify({"ok": True, "state": player_view_state(lobby, player)})

    if player.first_idx is not None and player.second_idx is not None:
        return jsonify({"ok": True, "state": player_view_state(lobby, player)})

    if idx in player.revealed and idx not in player.matched:
        return jsonify({"ok": True, "state": player_view_state(lobby, player)})

    player.flips += 1

    player.revealed[idx] = now_ms() + 900

    if player.first_idx is None:
        player.first_idx = idx
        return jsonify({"ok": True, "state": player_view_state(lobby, player)})

    player.second_idx = idx
    a = player.first_idx
    b = player.second_idx

    if lobby.board[a] == lobby.board[b] and a != b:
        player.matched.add(a)
        player.matched.add(b)
        player.matches += 1
        player.score += PAIR_SCORE

        player.revealed.pop(a, None)
        player.revealed.pop(b, None)
    else:
        player.misses += 1
        player.score -= MISS_PENALTY
        player.revealed[a] = now_ms() + 800
        player.revealed[b] = now_ms() + 800

    player.first_idx = None
    player.second_idx = None

    if player.is_finished(lobby.total_pairs()) and player.finished_ms is None:
        player.finished_ms = now_ms()

    return jsonify({"ok": True, "state": player_view_state(lobby, player)})


@app.route("/health")
def health():
    return "ok", 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
