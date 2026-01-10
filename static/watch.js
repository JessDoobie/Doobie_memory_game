function $(id){ return document.getElementById(id); }

const code = window.MM_WATCH_CODE;
const overlay = !!window.MM_OVERLAY;

function escapeHtml(s){
  return (s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function renderLeaderboard(lb, mode){
  const p = (lb.players || []);

  let html = `<table class="tbl">
    <tr>
      <th>#</th><th>Name</th><th>Team</th><th>Score</th><th>Matches</th><th>Misses</th>
    </tr>`;

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

function renderHeader(lobby){
  $("statusPill").textContent   = `Status: ${lobby.status}`;
  $("playersPill").textContent  = `Players: ${lobby.player_count}/10`;
  $("modePill").textContent     = `Mode: ${lobby.mode === "teams" ? "Teams" : "Solo"}`;
  $("boardPill").textContent    = `Board: ${lobby.cols}x${lobby.rows}`;

  if($("hint")){
    if(lobby.status === "waiting"){
      $("hint").textContent = "Waiting for host to start…";
    } else if(lobby.status === "running"){
      $("hint").textContent = "Round is running — leaderboard updates live.";
    } else {
      $("hint").textContent = "Round ended — winners can be announced!";
    }
  }

  if($("modeNote")){
    if(overlay){
      $("modeNote").textContent = ""; // keep overlay clean
    } else {
      $("modeNote").textContent =
        `Tip: Use “/watch/${lobby.code}?overlay=1” for transparent stream overlay mode.`;
    }
  }
}

async function refresh(){
  try{
    const res = await fetch(`/api/lobby/${code}`);
    const out = await res.json();
    if(!out.ok) return;

    renderHeader(out.lobby);
    renderLeaderboard(out.leaderboard, out.lobby.mode);
  }catch(e){
    // ignore
  }
}

refresh();
setInterval(refresh, 1000);
