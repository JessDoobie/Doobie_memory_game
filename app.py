import time, random, string
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
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
    lobby = LOBBIES[code]
    p = lobby["players"][pid]

    if p["hide_at"] and time.time() >= p["hide_at"]:
        for i in p["picks"]:
            if i not in p["matched"]:
                p["revealed"][i] = None
        p["picks"] = []
        p["hide_at"] = None

    return jsonify(
        ok=True,
        state={
            "lobby":{
                "rows":lobby["rows"],
                "cols":lobby["cols"],
                "status":lobby["status"],
                "player_count":len(lobby["players"]),
            },
            "grid":{
                "faces":p["revealed"],
                "matched":list(p["matched"]),
            },
            "player":{
                "name":p["name"],
                "score":p["score"],
                "matches":p["matches"],
                "misses":p["misses"],
            }
        },
        leaderboard={
            "players":[{"name":v["name"],"score":v["score"]}
                       for v in lobby["players"].values()]
        }
    )

@app.post("/api/flip")
def flip():
    data = request.json
    code = data["code"]
    pid = data["player_id"]
    idx = data["idx"]

    lobby = LOBBIES[code]
    p = lobby["players"][pid]

    if lobby["status"] != "running": return jsonify(ok=False)

    if idx in p["matched"] or p["revealed"][idx]:
        return jsonify(ok=True, state={})

    p["revealed"][idx] = lobby["deck"][idx]
    p["picks"].append(idx)

    if len(p["picks"]) == 2:
        a,b = p["picks"]
        if lobby["deck"][a] == lobby["deck"][b]:
            p["matched"].update([a,b])
            p["score"] += 10
            p["matches"] += 1
            p["picks"] = []
        else:
            p["misses"] += 1
            p["hide_at"] = time.time() + 0.45

    return jsonify(ok=True, state={})

if __name__ == "__main__":
    app.run(debug=True)
