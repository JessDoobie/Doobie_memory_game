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

function renderGrid(state){
  const lobby = state.lobby;
  const grid = $("grid");
  grid.innerHTML = "";

  grid.style.gridTemplateColumns = `repeat(${lobby.cols}, 1fr)`;

  state.player.faces.forEach((face, idx) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.style.height = "70px";

    if(state.player.matched.includes(idx)){
      tile.classList.add("matched");
      tile.textContent = face;
      tile.disabled = true;
    } else if(face){
      tile.classList.add("revealed");
      tile.textContent = face;
    } else {
      tile.classList.add("hidden");
      tile.textContent = "💜💨";
    }

    tile.onclick = async () => {
      if(lockInput) return;
      if(lobby.status !== "running") return;
      if(face) return;

      lockInput = true;
      await flip(idx);
      setTimeout(()=>lockInput=false, 250);
    };

    grid.appendChild(tile);
  });

  $("status").textContent =
    `Status: ${lobby.status} • Players: ${lobby.player_count}/10`;

  $("score").textContent   = state.player.score;
  $("matches").textContent = state.player.matches;
  $("misses").textContent  = state.player.misses;

  $("you").textContent = `You: ${state.player.name}`;

  $("hint").textContent =
    lobby.status === "waiting"
      ? "Waiting for host to start…"
      : "Find matching pairs!";
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

    if(!res.ok){
      $("warmup").querySelector("h2").textContent =
        "Lobby expired or server restarted";
      $("warmup").querySelector("p").textContent =
        "Please rejoin with a new code 💜";
      return;
    }

    const out = await res.json();

    if(!out.ok){
      localStorage.removeItem(playerKey);
      window.location.href = "/join";
      return;
    }

    $("warmup").style.display = "none";

    renderGrid(out.state);
    renderLeaderboard(out.leaderboard);
  }catch(e){
    // keep warmup visible during cold start
  }
}

async function flip(idx){
  await fetch("/api/flip", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({code, player_id: playerId, idx})
  });
}

getState();
setInterval(getState, 800);
