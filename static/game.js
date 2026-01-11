function $(id){ return document.getElementById(id); }

const code = window.MM_CODE;
const playerKey = "mm_player_id_" + code;
let playerId = localStorage.getItem(playerKey);

if(!playerId){
  window.location.href = "/join";
}

let lockInput = false;

function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function computeColumns(size){
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  const wide = window.innerWidth >= 700;

  if(size === 4) return 4;
  // size === 6
  if(isLandscape || wide) return 6;
  return 4;
}

function renderGrid(state){
  const lobby = state.lobby;
  const size = lobby.size;
  const faces = state.grid.faces;
  const matched = new Set(state.grid.matched || []);

  const cols = computeColumns(size);
  const grid = $("grid");
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  // tile size tuning
  let h = 78;
  if(size === 6 && cols === 4 && window.innerHeight < 760) h = 66;
  if(window.innerWidth < 380) h = Math.max(58, h - 8);

  grid.innerHTML = "";

  faces.forEach((face, idx) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.style.height = h + "px";
    tile.dataset.idx = String(idx);

    if(matched.has(idx)){
      tile.classList.add("matched");
      tile.textContent = face || "";
      tile.disabled = true;
    } else if(face){
      tile.classList.add("revealed");
      tile.textContent = face;
    } else {
      tile.classList.add("hidden");
      // single purple heart on back
      tile.textContent = "💜";
    }

    tile.onclick = async () => {
      if(lockInput) return;
      if(lobby.status !== "running") return;
      if(face) return; // already revealed currently
      lockInput = true;
      await flip(idx);
      setTimeout(() => { lockInput = false; }, 120);
    };

    grid.appendChild(tile);
  });

  // headers
  $("status").textContent = `Status: ${lobby.status} • Players: ${lobby.player_count}/${lobby.max_players} • Board: ${size}x${size}`;
  $("score").textContent = state.player.score;
  $("matches").textContent = state.player.matches;
  $("misses").textContent = state.player.misses;
  $("you").textContent = `You: ${state.player.name}${state.player.team ? " ("+state.player.team+")" : ""}`;
  $("mode").textContent = `Mode: ${lobby.mode === "teams" ? "Teams" : "Solo"}`;

  if(lobby.status === "waiting"){
    $("hint").textContent = "Waiting for host to start…";
  } else if(lobby.status === "ended"){
    $("hint").textContent = "Round ended.";
  } else {
    $("hint").textContent = "Find matches: +10 match, +1 miss on mismatch.";
  }
}

function renderLeaderboard(lb){
  const p = (lb.players || []);
  let html = `<table class="tbl"><tr><th>#</th><th>Name</th><th>Score</th><th>Matches</th><th>Misses</th></tr>`;
  p.slice(0, 10).forEach((r, i) => {
    html += `<tr><td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${r.score}</td><td>${r.matches}</td><td>${r.misses}</td></tr>`;
  });
  html += `</table>`;
  $("lb").innerHTML = html;
}

async function getState(){
  try {
    const res = await fetch(`/api/state/${code}/${playerId}`);
    const out = await res.json();

    if(!out.ok){
      localStorage.removeItem(playerKey);
      window.location.href = "/join";
      return;
    }

    const warm = $("warmup");
    if(warm) warm.style.display = "none";

    renderGrid(out.state);
    renderLeaderboard(out.leaderboard);
  } catch (e) {
    // keep warmup visible while server wakes up
  }
}

async function flip(idx){
  const res = await fetch("/api/flip", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({code, player_id: playerId, idx})
  });
  const out = await res.json();
  if(out.ok && out.state){
    renderGrid(out.state);
    if(out.leaderboard) renderLeaderboard(out.leaderboard);
  }
}

window.addEventListener("resize", () => {
  getState();
});

getState();
setInterval(getState, 750);

