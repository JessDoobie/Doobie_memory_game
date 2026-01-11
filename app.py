from flask import Flask, render_template, request, jsonify
import random, string

app = Flask(__name__)

LOBBIES = {}

def gen_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@app.route("/")
def home():
    return render_template("home.html")

@app.route("/join")
def join():
    return render_template("join.html")

@app.route("/play/<code>")
def play(code):
    return render_template("play.html", code=code)

@app.route("/host")
def host():
    return render_template("host.html")

@app.route("/api/lobby/<code>")
def api_lobby(code):
    lobby = LOBBIES.get(code)
    if not lobby:
        return jsonify(ok=False)
    return jsonify(
        ok=True,
        lobby={
            "code": code,
            "status": lobby["status"],
            "rows": lobby["rows"],
            "cols": lobby["cols"],
            "player_count": len(lobby["players"])
        },
        leaderboard=build_leaderboard(lobby)
    )

@app.route("/api/state/<code>/<player_id>")
def api_state(code, player_id):
    lobby = LOBBIES.get(code)
    if not lobby or player_id not in lobby["players"]:
        return jsonify(ok=False)

    return jsonify(
        ok=True,
        state={
            "lobby": {
                "status": lobby["status"],
                "rows": lobby["rows"],
                "cols": lobby["cols"],
                "player_count": len(lobby["players"])
            },
            "player": lobby["players"][player_id]
        },
        leaderboard=build_leaderboard(lobby)
    )

@app.route("/api/flip", methods=["POST"])
def api_flip():
    data = request.json
    lobby = LOBBIES.get(data["code"])
    p = lobby["players"][data["player_id"]]

    idx = data["idx"]
    if p["faces"][idx]:
        return jsonify(ok=True)

    p["faces"][idx] = lobby["solution"][idx]

    if p.get("last") is None:
        p["last"] = idx
    else:
        a = p["last"]
        b = idx
        if lobby["solution"][a] == lobby["solution"][b]:
            p["matched"] += [a,b]
            p["score"] += 10
            p["matches"] += 1
        else:
            p["faces"][a] = ""
            p["faces"][b] = ""
            p["misses"] += 1
        p["last"] = None

    return jsonify(ok=True)

def build_leaderboard(lobby):
    players = list(lobby["players"].values())
    players.sort(key=lambda p: -p["score"])
    return {"players": players}

