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

function computeColumns(lobby){
  const wide = window.innerWidth >= 700;
  const cols = lobby.cols;

  if(wide) return cols;
  if(cols >= 6 && window.innerWidth < 420) return 4;
  return cols;
}

function renderGrid(state){
  const lobby = state.lobby;
  const faces = state.grid.faces || [];
  const matched = new Set(state.grid.matched || []);

  const grid = $("grid");
  if(!grid) return;

  const cols = computeColumns(lobby);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.innerHTML = "";

  let h = 78;
  if(window.innerWidth < 420) h = 64;
  if(window.innerWidth < 360) h = 58;

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
      tile.textContent = "💜";   // ✅ ONLY purple heart
    }

    tile.onclick = () => {
      if(lockInput) return;
      if(lobby.status !== "running") return;
      if(face) return;

      lockInput = true;
      flip(idx); // no await = instant feel
      setTimeout(()=>lockInput=false, 180);
    };

    grid.appendChild(tile);
  });

  $("status").textContent =
    `Status: ${lobby.status} • Players: ${lobby.player_count}/10 • Board: ${lobby.rows}x${lobby.cols}`;

  $("score").textContent   = state.player.score;
  $("matches").textContent = state.player.matches;
  $("misses").textContent  = state.player.misses;

  $("you").textContent =
    `You: ${state.player.name}${state.player.team ? " ("+state.player.team+")" : ""}`;

  $("mode").textContent =
    `Mode: ${lobby.mode === "teams" ? "Teams" : "Solo"}`;

  if(lobby.status === "waiting"){
    $("hint").textContent = lobby.allow_join
      ? "Waiting for host to start…"
      : "Joining locked — waiting for host…";
  } else if(lobby.status === "ended"){
    $("hint").textContent = state.player.finished
      ? "Round ended — nice!"
      : "Round ended.";
  } else {
    $("hint").textContent = "Find matches: +10 match, -1 miss.";
  }
}

function renderLeaderboard(lb, mode){
  const p = (lb.players || []);
  let html = `<table class="tbl">
    <tr><th>#</th><th>Name</th><th>Team</th><th>Score</th><th>Matches</th><th>Misses</th></tr>`;

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

  if(mode === "teams" && (lb.teams||[]).length){
    $("teamsBox").style.display = "block";
    let th = `<div class="card inner"><h4>Teams (best 3 combined)</h4>`;
    th += `<table class="tbl">
      <tr><th>#</th><th>Team</th><th>Score</th><th>Top 3</th></tr>`;

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

    if(!res.ok){
      const warm = $("warmup");
      if(warm){
        warm.style.display = "flex";
        warm.querySelector("h2").textContent = "Session not valid";
        warm.querySelector("p").textContent = "Go back to Join and enter the code again 💜";
      }
      return;
    }

    const out = await res.json();

    if(!out.ok){
      localStorage.removeItem(playerKey);
      window.location.href = "/join";
      return;
    }

    const warm = $("warmup");
    if(warm) warm.style.display = "none";

    renderGrid(out.state);
    renderLeaderboard(out.leaderboard, out.state.lobby.mode);
  }catch(e){
    // keep warmup during cold start
  }
}

async function flip(idx){
  try{
    const res = await fetch("/api/flip", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({code, player_id: playerId, idx})
    });

    const out = await res.json();

    if(out.ok && out.state){
      renderGrid(out.state);
      if(out.leaderboard){
        renderLeaderboard(out.leaderboard, out.state.lobby.mode);
      }
      // hide warmup if it was up
      const warm = $("warmup");
      if(warm) warm.style.display = "none";
    }
  }catch(e){
    // ignore
  }
}


window.addEventListener("resize", () => {
  getState();
});

getState();
setInterval(getState, 800);

