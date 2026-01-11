function $(id){ return document.getElementById(id); }

const code = window.MM_CODE;
const playerKey = "mm_player_id_" + code;
let playerId = localStorage.getItem(playerKey);

if(!playerId){
  window.location.href = "/join";
}

let lockInput = false;

function escapeHtml(s){
  return (s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

/**
 * Mobile rule:
 * - Phones (portrait-ish) use 4 columns for big tap targets.
 * - Otherwise use lobby.cols.
 */
function computeColumns(lobby){
  const cols = lobby.cols || 4;
  const isPhone = window.innerWidth < 700;
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;

  if(isPhone && isPortrait) return 4;
  return cols;
}

function renderGrid(state){
  const lobby = state.lobby;
  const rows = lobby.rows || 4;
  const cols = lobby.cols || 4;

  const faces = state.grid.faces || [];
  const matched = new Set(state.grid.matched || []);

  const grid = $("grid");
  const showCols = computeColumns(lobby);

  grid.style.gridTemplateColumns = `repeat(${showCols}, 1fr)`;
  grid.innerHTML = "";

  // Tile height tuning (keeps phone scroll reasonable)
  let h = 84;
  const isPhone = window.innerWidth < 700;
  if(isPhone) h = 76;
  if(isPhone && window.innerHeight < 760) h = 68;

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
      tile.textContent = "💜"; // back-of-card icon (single emoji)
    }

    tile.onclick = async () => {
      if(lockInput) return;
      if(lobby.status !== "running") return;
      if(face) return;
      lockInput = true;
      await flip(idx);
      // very small cooldown prevents double-tap spam
      setTimeout(() => { lockInput = false; }, 120);
    };

    grid.appendChild(tile);
  });

  // Header stats
  $("status").textContent =
    `Status: ${lobby.status} • Players: ${lobby.player_count}/10 • Board: ${rows}x${cols}`;

  $("score").textContent = state.player.score;
  $("matches").textContent = state.player.matches;
  $("misses").textContent = state.player.misses;
  $("you").textContent = `You: ${state.player.name}${state.player.team ? " ("+state.player.team+")" : ""}`;
  $("mode").textContent = `Mode: ${lobby.mode === "teams" ? "Teams" : "Solo"}`;

  if(lobby.status === "waiting"){
    $("hint").textContent = lobby.join_locked
      ? "Joining locked — waiting for host…"
      : "Waiting for host to start…";
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
    html += `<tr>
      <td>${i+1}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.team||"")}</td>
      <td>${r.score}</td>
      <td>${r.matches}</td>
      <td>${r.misses}</td>
    </tr>`;
  });
  html += `</table>`;
  $("lb").innerHTML = html;

  // Optional team summary block
  if(mode === "teams" && (lb.teams||[]).length){
    $("teamsBox").style.display = "block";
    let th = `<div class="card inner"><h4>Teams (best 3 combined)</h4>`;
    th += `<table class="tbl"><tr><th>#</th><th>Team</th><th>Score</th><th>Top 3</th></tr>`;
    lb.teams.forEach((t, i) => {
      th += `<tr>
        <td>${i+1}</td>
        <td>${escapeHtml(t.team)}</td>
        <td>${t.score}</td>
        <td>${escapeHtml((t.members||[]).join(", "))}</td>
      </tr>`;
    });
    th += `</table></div>`;
    $("teamsBox").innerHTML = th;
  } else {
    $("teamsBox").style.display = "none";
    $("teamsBox").innerHTML = "";
  }
}

async function getState(){
  try{
    const res = await fetch(`/api/state/${code}/${playerId}`);
    const out = await res.json();

    if(!out.ok){
      localStorage.removeItem(playerKey);
      window.location.href = "/join";
      return;
    }

    const warm = document.getElementById("warmup");
    if(warm) warm.style.display = "none";

    renderGrid(out.state);
    renderLeaderboard(out.leaderboard, out.state.lobby.mode);

  }catch(e){
    // keep warmup visible while server wakes
  }
}

async function flip(idx){
  const res = await fetch("/api/flip", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ code, player_id: playerId, idx })
  });
  const out = await res.json();
  if(out.ok && out.state){
    renderGrid(out.state);
  }
}

window.addEventListener("resize", () => getState());

getState();
setInterval(getState, 650);
