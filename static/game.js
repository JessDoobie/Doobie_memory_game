function $(id){ return document.getElementById(id); }

const code = window.MM_CODE;
const playerKey = "mm_player_id_" + code;
let playerId = localStorage.getItem(playerKey);

if(!playerId){
  // If they went directly to /play without joining, send them to join
  window.location.href = "/join";
}

let lockInput = false;

function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function computeColumns(size){
  // Size is 4 or 6
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  const wide = window.innerWidth >= 700;

  if(size === 4) return 4;

  // size === 6
  if(isLandscape || wide) return 6;
  return 4; // portrait phones: bigger tap targets, more rows
}

function renderGrid(state){
  const lobby = state.lobby;
  const size = lobby.size;
  const faces = state.grid.faces;
  const matched = new Set(state.grid.matched || []);

  const cols = computeColumns(size);
  const grid = $("grid");
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  // Determine tile height based on screen
  // Keep tap targets large on mobile; shrink a bit on small portrait 6x6
  let h = 78;
  if(size === 6 && cols === 4 && window.innerHeight < 760) h = 64;
  if(window.innerWidth < 380) h = Math.max(58, h - 8);

  grid.innerHTML = "";

  faces.forEach((face, idx) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.style.height = h + "px";

    if(matched.has(idx)){
      tile.classList.add("matched");
      tile.textContent = face || "";
      tile.disabled = true;
    } else if(face){
      tile.classList.add("revealed");
      tile.textContent = face;
    } else {
      tile.classList.add("hidden");
      tile.textContent = "•";
    }

    tile.onclick = async () => {
      if(lockInput) return;
      // only allow flips when running
      if(lobby.status !== "running") return;
      if(face) return; // already revealed currently
      lockInput = true;
      await flip(idx);
      // tiny cooldown prevents spam double taps
      setTimeout(() => { lockInput = false; }, 180);
    };

    grid.appendChild(tile);
  });

  // Update header stats
  $("status").textContent = `Status: ${lobby.status} • Players: ${lobby.player_count}/10 • Board: ${size}x${size}`;
  $("score").textContent = state.player.score;
  $("matches").textContent = state.player.matches;
  $("misses").textContent = state.player.misses;
  $("you").textContent = `You: ${state.player.name}${state.player.team ? " ("+state.player.team+")" : ""}`;
  $("mode").textContent = `Mode: ${lobby.mode === "teams" ? "Teams" : "Solo"}`;

  if(lobby.status === "waiting"){
    $("hint").textContent = "Waiting for host to start…";
  } else if(lobby.status === "ended"){
    $("hint").textContent = state.player.finished ? "Round ended — nice!" : "Round ended.";
  } else {
    $("hint").textContent = state.player.finished ? "✅ Finished! Watch the leaderboard." : "Find matches: +10 match, -1 miss.";
  }
}

function renderLeaderboard(lb, mode){
  const p = (lb.players || []);
  let html = `<table class="tbl"><tr><th>#</th><th>Name</th><th>Team</th><th>Score</th><th>Matches</th><th>Misses</th></tr>`;
  p.slice(0, 10).forEach((r, i) => {
    html += `<tr><td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.team||"")}</td><td>${r.score}</td><td>${r.matches}</td><td>${r.misses}</td></tr>`;
  });
  html += `</table>`;
  $("lb").innerHTML = html;

  if(mode === "teams" && (lb.teams||[]).length){
    $("teamsBox").style.display = "block";
    let th = `<div class="card inner"><h4>Teams (best 3 combined)</h4>`;
    th += `<table class="tbl"><tr><th>#</th><th>Team</th><th>Score</th><th>Top 3</th></tr>`;
    lb.teams.forEach((t, i) => {
      th += `<tr><td>${i+1}</td><td>${escapeHtml(t.team)}</td><td>${t.score}</td><td>${escapeHtml((t.members||[]).join(", "))}</td></tr>`;
    });
    th += `</table></div>`;
    $("teamsBox").innerHTML = th;
  } else {
    $("teamsBox").style.display = "none";
    $("teamsBox").innerHTML = "";
  }
}

async function getState(){
  try {
    const res = await fetch(`/api/state/${code}/${playerId}`);

    if (!res.ok) throw new Error("server not ready");

    const out = await res.json();

    if(!out.ok){
      localStorage.removeItem(playerKey);
      window.location.href = "/join";
      return;
    }

    // Hide warmup once server responds
    const warm = document.getElementById("warmup");
    if(warm) warm.style.display = "none";

    renderGrid(out.state);
    renderLeaderboard(out.leaderboard, out.state.lobby.mode);
  } catch (e) {
    // Keep warmup visible while server wakes up
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
  }
}

window.addEventListener("resize", () => {
  // re-render quickly on orientation change
  getState();
});

getState();
setInterval(getState, 750);
