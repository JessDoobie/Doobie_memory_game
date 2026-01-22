function $(id){ return document.getElementById(id); }

let currentLobbyCode = null;
let lastBlurbLong = true;

function qs(k){
  return new URLSearchParams(window.location.search).get(k);
}

function setHostKeyFromUrl(){
  const hk = qs("host_key");
  if(hk && $("hostKey")){
    $("hostKey").value = hk;
  }
}

function apiHostHeaders(){
  return { "Content-Type": "application/json" };
}

function baseUrl(){
  return window.location.origin;
}

function boardPresetToRowsCols(preset){
  const parts = (preset || "5x4").split("x");
  return { rows: parseInt(parts[1],10), cols: parseInt(parts[0],10) };
}

// -------------------------------
// Create Lobby
// -------------------------------
async function createLobby(){
  console.log("createLobby() fired");

async function createLobby(){
  const preset = $("boardPreset").value;
  const {rows, cols} = boardPresetToRowsCols(preset);

  const body = {
    mode: $("mode").value,
    entry_mode: $("entry").value,
    rows, cols
  };

  const res = await fetch("/api/host/create_lobby", {
    method: "POST",
    headers: apiHostHeaders(),
    body: JSON.stringify(body)
  });

  const out = await res.json();
  if(!out.ok){
    alert(out.error || "Failed to create lobby");
    return;
  }

  currentLobbyCode = out.lobby.code;
  showLobbyUI(out.lobby);
  refreshLobby();
}

// -------------------------------
// UI
// -------------------------------
function showLobbyUI(lobby){
  const panel = $("lobbyBox");
  if (!panel) return;

  panel.style.display = "block";
  $("codePill").textContent = lobby.code;

  const join = `${baseUrl()}/join`;
  const play = `${baseUrl()}/play/${lobby.code}`;
  const watch = `${baseUrl()}/watch/${lobby.code}`;

  $("joinLink").textContent  = join;
  $("playLink").textContent  = play;
  $("watchLink").textContent = watch;

  const startBtn = $("startBtn");
  if (startBtn) {
    startBtn.onclick = async () => {
      if (!currentLobbyCode) return;
      await fetch(`/api/host/start_round/${currentLobbyCode}`, {
        method: "POST",
        headers: apiHostHeaders()
      });
      refreshLobby();
    };
  }
}


// -------------------------------
// Refresh
// -------------------------------
async function refreshLobby(){
  if(!currentLobbyCode) return;

  const res = await fetch(`/api/lobby/${currentLobbyCode}`);
  const out = await res.json();
  if(!out.ok) return;

  renderLeaderboard(out.leaderboard);
}

function renderLeaderboard(lb){
  const el = $("leaderboard");
  if(!el) return;

  el.innerHTML = "";

  (lb.players || [])
    .sort((a,b)=>b.score-a.score)
    .forEach(p=>{
      const row = document.createElement("div");
      row.textContent = `${p.name} — ${p.score} pts`;
      el.appendChild(row);
    });
}

// -------------------------------
// Init
// -------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setHostKeyFromUrl();

  const btn = $("createLobbyBtn");
  if(btn){
    btn.addEventListener("click", createLobby);
  }

  setInterval(refreshLobby, 1000);
});


