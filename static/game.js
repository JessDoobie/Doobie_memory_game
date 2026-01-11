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

/* Phones always use 4 columns */
function computeColumns(lobby){
  return window.innerWidth < 700 ? 4 : lobby.cols;
}

function renderGrid(state){
  const lobby = state.lobby;
  const faces = state.grid.faces;
  const matched = new Set(state.grid.matched || []);

  const grid = $("grid");
  const cols = computeColumns(lobby);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.innerHTML = "";

  /* Tile height tuning */
  let h = 82;
  const isPhone = window.innerWidth < 700;
  if(isPhone) h = 72;
  if(isPhone && lobby.rows >= 6) h = 64;

  faces.forEach((face, idx) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.style.height = h + "px";
    tile.dataset.idx = idx;

    if(matched.has(idx)){
      tile.classList.add("matched");
      tile.textContent = face;
      tile.disabled = true;
    } else if(face){
      tile.classList.add("revealed");
      tile.textContent = face;
    } else {
      tile.classList.add("hidden");
      tile.textContent = "💜";
    }

    tile.onclick = async () => {
      if(lockInput) return;
      if(lobby.status !== "running") return;
      if(face) return;

      lockInput = true;
      await flip(idx);
      setTimeout(()=>lockInput=false, 120);
    };

    grid.appendChild(tile);
  });

  $("status").textContent =
    `Status: ${lobby.status} • Players: ${lobby.player_count} • Board: ${lobby.rows}x${lobby.cols}`;

  $("score").textContent = state.player.score;
  $("matches").textContent = state.player.matches;
  $("misses").textContent = state.player.misses;
  $("you").textContent = `You: ${state.player.name}`;
  $("mode").textContent = lobby.mode === "teams" ? "Teams" : "Solo";

  if(lobby.status === "waiting"){
    $("hint").textContent = "Waiting for host to start…";
  } else {
    $("hint").textContent = "Find matches!";
  }
}

function renderLeaderboard(lb){
  let html = `<table class="tbl">
    <tr><th>#</th><th>Name</th><th>Score</th></tr>`;
  lb.players.forEach((p,i)=>{
    html += `<tr>
      <td>${i+1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.score}</td>
    </tr>`;
  });
  html += `</table>`;
  $("lb").innerHTML = html;
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

    const warm = $("warmup");
    if(warm) warm.classList.add("is-hidden");

    renderGrid(out.state);
    renderLeaderboard(out.leaderboard);
  }catch(e){
    // server waking up
  }
}

async function flip(idx){
  const res = await fetch("/api/flip", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ code, player_id: playerId, idx })
  });
  const out = await res.json();
  if(out.ok) renderGrid(out.state);
}

window.addEventListener("resize", getState);

getState();
setInterval(getState, 600);
