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
  const key = ($("hostKey")?.value || "").trim();
  return {
    "Content-Type": "application/json",
    "X-Host-Key": key
  };
}

function copyText(text){
  navigator.clipboard.writeText(text).catch(()=>{});
}

function baseUrl(){
  return window.location.origin;
}

function boardPresetToRowsCols(preset){
  // preset like "6x4"
  const parts = (preset || "6x4").toLowerCase().split("x");
  const cols = parseInt(parts[0], 10);
  const rows = parseInt(parts[1], 10);
  return { rows, cols };
}

function updateTeamNote(){
  const mode = $("mode")?.value || "solo";
  $("teamNote").style.display = (mode === "teams") ? "block" : "none";
}

function buildChatBlurb(code, entryMode, short=false){
  const join = `${baseUrl()}/join`;
  const watch = `${baseUrl()}/watch/${code}`;
  const entryLine = entryMode === "ticket" ? "🎟️ Ticket entry" : "✅ Free entry";

  if(!short){
    return [
      "🧠 Memory Match is LIVE!",
      `Go to: ${join}`,
      "Click Join a Game",
      `Enter CODE: ${code}`,
      entryLine,
      `👀 Spectate: ${watch}`
    ].join("\n");
  }

  return [
    `🧠 Memory Match! Join: ${join}`,
    `CODE: ${code} • ${entryLine.replace("✅ ","").replace("🎟️ ","")}`,
    `Spectate: ${watch}`
  ].join("\n");
}

function renderPlayers(lbPlayers){
  const box = $("playersBox");
  const countPill = $("playerCountPill");

  if(!lbPlayers || !lbPlayers.length){
    box.innerHTML = `<div class="tiny muted">No players yet.</div>`;
    countPill.textContent = `Players: 0/10`;
    return;
  }

  countPill.textContent = `Players: ${lbPlayers.length}/10`;

  let html = `<table class="tbl">
    <tr><th>Name</th><th>Team</th><th>Score</th><th>Kick</th></tr>`;

  lbPlayers.forEach(p => {
    html += `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.team||"")}</td>
      <td>${p.score}</td>
      <td><button class="btn outline" data-kick="${p.player_id}">Kick</button></td>
    </tr>`;
  });

  html += `</table>`;
  box.innerHTML = html;

  box.querySelectorAll("button[data-kick]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const pid = btn.getAttribute("data-kick");
      if(!pid || !currentLobbyCode) return;
      await fetch(`/api/host/kick/${currentLobbyCode}`, {
        method: "POST",
        headers: apiHostHeaders(),
        body: JSON.stringify({player_id: pid})
      });
      refreshLobby(); // update list
    });
  });
}

function escapeHtml(s){
  return (s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}
function renderLeaderboard(lb){
  const el = $("leaderboard");
  if(!el) return;

  el.innerHTML = "";

  const players = lb?.players || [];
  if(!players.length){
    el.innerHTML = `<div class="tiny muted">No scores yet.</div>`;
    return;
  }

  players
    .slice()
    .sort((a,b)=>b.score-a.score)
    .forEach(p=>{
      const row = document.createElement("div");
      row.textContent =
        `${p.name} — ${p.score} pts (${p.matches}✓ / ${p.misses}✗)`;
      el.appendChild(row);
    });
}



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
    alert(out.error || "Failed to create lobby.");
    return;
  }

  currentLobbyCode = out.lobby.code;
  showLobbyUI(out.lobby);
  refreshLobby(); // start polling
}



function showLobbyUI(lobby){
  $("lobbyPanel").style.display = "block";
  $("codePill").textContent = lobby.code;

  const join = `${baseUrl()}/join`;
  const play = `${baseUrl()}/play/${lobby.code}`;
  const watch = `${baseUrl()}/watch/${lobby.code}`;
  const overlay = `${baseUrl()}/watch/${lobby.code}?overlay=1`;

  $("joinLink").value = join;
  $("playLink").value = play;
  $("watchLink").value = watch;
  $("overlayLink").value = overlay;

  $("chatBlurb").value = buildChatBlurb(lobby.code, lobby.entry_mode, false);
  lastBlurbLong = true;

  // Copy buttons
  $("copyJoinBtn").onclick = () => copyText(join);
  $("copyPlayBtn").onclick = () => copyText(play);
  $("copyWatchBtn").onclick = () => copyText(watch);

  // ✅ NEW: copy overlay link button
  $("copyOverlayBtn").onclick = () => copyText(overlay);

  $("copyBlurbBtn").onclick = () => copyText($("chatBlurb").value);

  $("shortenBlurbBtn").onclick = () => {
    lastBlurbLong = !lastBlurbLong;
    $("chatBlurb").value = buildChatBlurb(lobby.code, lobby.entry_mode, !lastBlurbLong);
  };

  // Round controls (SAFE — won't crash if buttons are missing)
const startBtn = $("startBtn");
if (startBtn) {
  startBtn.onclick = async () => {
    if(!currentLobbyCode) return;
    await fetch(`/api/host/start_round/${currentLobbyCode}`, {
      method: "POST",
      headers: apiHostHeaders()
    });
    refreshLobby();
  };
}

const endBtn = $("endBtn");
if (endBtn) {
  endBtn.onclick = async () => {
    if(!currentLobbyCode) return;
    await fetch(`/api/host/end_round/${currentLobbyCode}`, {
      method: "POST",
      headers: apiHostHeaders()
    });
    refreshLobby();
  };
}

const resetBtn = $("resetBtn");
if (resetBtn) {
  resetBtn.onclick = async () => {
    if(!currentLobbyCode) return;
    await fetch(`/api/host/reset_lobby/${currentLobbyCode}`, {
      method: "POST",
      headers: apiHostHeaders()
    });
    refreshLobby();
  };
}


  // Prizes
  $("savePrizesBtn").onclick = async () => {
    if(!currentLobbyCode) return;
    const body = { p1: $("p1").value, p2: $("p2").value, p3: $("p3").value };
    await fetch(`/api/host/set_prizes/${currentLobbyCode}`, {
      method: "POST",
      headers: apiHostHeaders(),
      body: JSON.stringify(body)
    });
    refreshLobby();
  };

  // Copy winners
  $("copyWinnersBtn").onclick = () => {
    copyText($("winnersText").value || "");
  };
}

function updateWinnersText(lb, lobby){
  const prizes = lobby.prizes || {"1":"","2":"","3":""};
  const p = (lb.players || []).slice(0, 3);

  let lines = [];
  lines.push(`🏆 Winners — Lobby ${lobby.code}`);
  lines.push(`Status: ${lobby.status} • Mode: ${lobby.mode} • Board: ${lobby.cols}x${lobby.rows}`);
  lines.push("");

  const places = ["1st","2nd","3rd"];
  for(let i=0;i<3;i++){
    const row = p[i];
    const prize = prizes[String(i+1)] || "";
    if(row){
      lines.push(`${places[i]}: ${row.name} (${row.score} pts)${row.team ? " • Team " + row.team : ""}${prize ? " • Prize: " + prize : ""}`);
    }else{
      lines.push(`${places[i]}: —`);
    }
  }

  $("winnersText").value = lines.join("\n");
}

async function refreshLobby(){
  if(!currentLobbyCode) return;

  const res = await fetch(`/api/lobby/${currentLobbyCode}`);
  const out = await res.json();
  if(!out.ok) return;

  // chat blurb update
  if(lastBlurbLong){
    $("chatBlurb").value = buildChatBlurb(out.lobby.code, out.lobby.entry_mode, false);
  }else{
    $("chatBlurb").value = buildChatBlurb(out.lobby.code, out.lobby.entry_mode, true);
  }

  // ✅ THESE THREE BELONG TOGETHER
  renderPlayers(out.leaderboard.players);
  renderLeaderboard(out.leaderboard);   // ← ADD THIS LINE
  updateWinnersText(out.leaderboard, out.lobby);
}


function startPolling(){
  setInterval(() => {
    refreshLobby();
  }, 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  setHostKeyFromUrl();
  updateTeamNote();
  $("mode").addEventListener("change", updateTeamNote);

  console.log("create button:", $("createLobbyBtn"));

  $("createLobbyBtn").addEventListener("click", createLobby);

  startPolling();
});

