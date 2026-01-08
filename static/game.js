function $(id){ return document.getElementById(id); }

// Provided by play.html
const code = window.MM_CODE;
const playerKey = "mm_player_id_" + code;
let playerId = localStorage.getItem(playerKey);

if(!playerId){
  window.location.href = "/join";
}

let lockInput = false;

/* ------------------------------
   FX STATE + AUDIO
--------------------------------*/
let prevMatches = null;
let prevMisses = null;
let prevMatchedSet = new Set();

let audioCtx = null;

function ensureAudio(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(Ctx) audioCtx = new Ctx();
  }
  if(audioCtx && audioCtx.state === "suspended"){
    audioCtx.resume().catch(()=>{});
  }
}

function beep(type){
  ensureAudio();
  if(!audioCtx) return;

  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);

  if(type === "match"){
    o.type = "triangle";
    o.frequency.setValueAtTime(740, t0);
    o.frequency.exponentialRampToValueAtTime(980, t0 + 0.08);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.start(t0);
    o.stop(t0 + 0.16);
  } else {
    o.type = "sine";
    o.frequency.setValueAtTime(220, t0);
    o.frequency.exponentialRampToValueAtTime(160, t0 + 0.10);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.start(t0);
    o.stop(t0 + 0.18);
  }
}

function shakeGrid(){
  const grid = $("grid");
  if(!grid) return;
  grid.classList.remove("grid-shake");
  void grid.offsetWidth;
  grid.classList.add("grid-shake");
  setTimeout(()=>grid.classList.remove("grid-shake"), 260);
}

/* ------------------------------
   HELPERS
--------------------------------*/
function escapeHtml(s){
  return (s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function computeColumns(size){
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  const wide = window.innerWidth >= 700;
  if(size === 4) return 4;
  if(isLandscape || wide) return 6;
  return 4;
}

/* ------------------------------
   RENDER GRID
--------------------------------*/
function renderGrid(state){
  const lobby = state.lobby;
  const size = lobby.size;
  const faces = state.grid.faces;
  const matched = new Set(state.grid.matched || []);

  const cols = computeColumns(size);
  const grid = $("grid");
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  let h = 78;
  if(size === 6 && cols === 4 && window.innerHeight < 760) h = 64;
  if(window.innerWidth < 380) h = Math.max(58, h - 8);

  grid.innerHTML = "";

  faces.forEach((face, idx) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.dataset.idx = String(idx);
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
      if(lobby.status !== "running") return;
      if(face) return;

      lockInput = true;
      ensureAudio();
      await flip(idx);
      setTimeout(() => { lockInput = false; }, 180);
    };

    grid.appendChild(tile);
  });

  $("status").textContent =
    `Status: ${lobby.status} • Players: ${lobby.player_count}/10 • Board: ${size}x${size}`;
  $("score").textContent = state.player.score;
  $("matches").textContent = state.player.matches;
  $("misses").textContent = state.player.misses;
  $("you").textContent =
    `You: ${state.player.name}${state.player.team ? " ("+state.player.team+")" : ""}`;
  $("mode").textContent =
    `Mode: ${lobby.mode === "teams" ? "Teams" : "Solo"}`;

  if(lobby.status === "waiting"){
    $("hint").textContent = "Waiting for host to start…";
  } else if(lobby.status === "ended"){
    $("hint").textContent =
      state.player.finished ? "Round ended — nice!" : "Round ended.";
  } else {
    $("hint").textContent =
      state.player.finished
        ? "✅ Finished! Watch the leaderboard."
        : "Find matches: +10 match, -1 miss.";
  }

  /* ---- MATCH / MISS FX ---- */
  const curMatches = state.player.matches;
  const curMisses = state.player.misses;
  const currentMatched = new Set(state.grid.matched || []);

  const newlyMatched = [];
  currentMatched.forEach(i => {
    if(!prevMatchedSet.has(i)) newlyMatched.push(i);
  });

  if(newlyMatched.length){
    beep("match");
    newlyMatched.forEach(i => {
      const btn = grid.querySelector(`.tile[data-idx="${i}"]`);
      if(btn){
        btn.classList.add("match-pop");
        setTimeout(()=>btn.classList.remove("match-pop"), 260);
      }
    });
  }

  if(prevMisses !== null && curMisses > prevMisses){
    beep("miss");
    shakeGrid();
  }

  prevMatches = curMatches;
  prevMisses = curMisses;
  prevMatchedSet = currentMatched;
}

/* ------------------------------
   LEADERBOARD
--------------------------------*/
function renderLeaderboard(lb, mode){
  const p = (lb.players || []);
  let html =
    `<table class="tbl">
      <tr><th>#</th><th>Name</th><th>Team</th>
          <th>Score</th><th>Matches</th><th>Misses</th></tr>`;

  p.slice(0, 10).forEach((r, i) => {
    html +=
      `<tr>
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
    th +=
      `<table class="tbl">
        <tr><th>#</th><th>Team</th><th>Score</th><th>Top 3</th></tr>`;
    lb.teams.forEach((t, i) => {
      th +=
        `<tr>
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

/* ------------------------------
   SERVER POLLING
--------------------------------*/
async function getState(){
  try {
    const res = await fetch(`/api/state/${code}/${playerId}`);
    if(!res.ok) throw new Error();
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
  } catch(e){
    // keep warmup visible while waking
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
    setTimeout(getState, 80);
  }
}

window.addEventListener("resize", () => {
  getState();
});

getState();
setInterval(getState, 750);
