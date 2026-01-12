// -------------------------------
// Helpers
// -------------------------------
function $(id){ return document.getElementById(id); }

const code = window.MM_CODE;
const playerKey = "mm_player_id_" + code;
let playerId = localStorage.getItem(playerKey);

// If someone goes directly to /play without joining
if(!playerId){
  window.location.href = "/join";
}

// -------------------------------
// Mobile scroll protection (FIX A)
// -------------------------------
let isUserScrolling = false;
let scrollTimer = null;

window.addEventListener("scroll", () => {
  isUserScrolling = true;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    isUserScrolling = false;
  }, 220);
}, { passive: true });

// -------------------------------
// State tracking
// -------------------------------
let lockInput = false;
let flipInFlight = false;
let prevMisses = null;
let prevMatchedSet = new Set();

// -------------------------------
// Utilities
// -------------------------------
function escapeHtml(s){
  return (s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function computeColumns(cols){
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  const wide = window.innerWidth >= 700;

  if(cols <= 4) return cols;
  if(isLandscape || wide) return cols;
  return Math.max(3, cols - 1);
}

// -------------------------------
// Rendering
// -------------------------------
function renderGrid(state){
  const lobby = state.lobby;
  const gridState = state.grid;
  const matched = new Set(gridState.matched || []);

  const grid = $("grid");
  const cols = computeColumns(gridState.cols || lobby.cols || 4);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  // Responsive tile height
  let h = 76;
  if(window.innerHeight < 720) h = 66;
  if(window.innerWidth < 380) h = 58;

  grid.innerHTML = "";

  gridState.faces.forEach((face, idx) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.style.height = h + "px";
    tile.dataset.idx = idx;

    if(matched.has(idx)){
      tile.classList.add("matched");
      tile.textContent = face;
      tile.disabled = true;
    }
    else if(face){
      tile.classList.add("revealed");
      tile.textContent = face;
    }
    else{
      tile.classList.add("hidden");
      tile.textContent = "💜";
    }

 tile.onclick = async () => {
  if (lockInput || flipInFlight) return;
  if (lobby.status !== "running") return;
  if (face) return;

  lockInput = true;
  flipInFlight = true;

  try {
    await flip(idx);
  } catch (e) {
    console.error("flip failed:", e);
  } finally {
    // Unlock immediately so PC taps feel responsive
    flipInFlight = false;
    lockInput = false;
  }

  // Refresh state in the background (don't block clicks)
  getState();
};



    grid.appendChild(tile);
  });

  // Match FX
  const newlyMatched = [];
  matched.forEach(i => {
    if(!prevMatchedSet.has(i)) newlyMatched.push(i);
  });

  if(newlyMatched.length){
    newlyMatched.forEach(i => {
      const btn = grid.querySelector(`.tile[data-idx="${i}"]`);
      if(btn){
        btn.classList.add("match-pop");
        setTimeout(() => btn.classList.remove("match-pop"), 220);
      }
    });
  }

  prevMatchedSet = matched;
}

function renderHUD(state){
  const lobby = state.lobby;
  const player = state.player;

  $("status").textContent =
    `Status: ${lobby.status} • Players: ${lobby.player_count}/10 • Board: ${lobby.rows}x${lobby.cols}`;

  $("score").textContent = player.score;
  $("matches").textContent = player.matches;
  $("misses").textContent = player.misses;

  $("you").textContent = `You: ${player.name}`;
  $("mode").textContent = `Mode: ${lobby.mode === "teams" ? "Teams" : "Solo"}`;

  if(lobby.status === "waiting"){
    $("hint").textContent = "Waiting for host to start…";
  }
  else if(lobby.status === "ended"){
    $("hint").textContent = "Round ended.";
  }
  else{
    $("hint").textContent = "Find matches!";
  }
}

function renderLeaderboard(lb){
  const p = lb.players || [];
  let html = `<table class="tbl">
    <tr><th>#</th><th>Name</th><th>Score</th><th>Matches</th><th>Misses</th></tr>`;

  p.slice(0,10).forEach((r,i)=>{
    html += `<tr>
      <td>${i+1}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${r.score}</td>
      <td>${r.matches}</td>
      <td>${r.misses}</td>
    </tr>`;
  });

  html += `</table>`;
  $("lb").innerHTML = html;
}

// -------------------------------
// Network
// -------------------------------
async function getState(){
  try{
    const res = await fetch(`/api/state/${code}/${playerId}`);
    const out = await res.json();

    if(!out.ok){
      localStorage.removeItem(playerKey);
      window.location.href = "/join";
      return;
    }

    // Hide warmup when server responds
    const warm = $("warmup");
    if(warm) warm.classList.add("is-hidden");

    // FIX A: Skip redraw while scrolling
    if(!isUserScrolling){
      renderGrid(out.state);
      renderHUD(out.state);
      renderLeaderboard(out.leaderboard);
    }

  }catch(e){
    // keep warmup visible while server sleeps
  }
}

async function flip(idx){
  const res = await fetch("/api/flip", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      code,
      player_id: playerId,
      idx
    })
  });

  const out = await res.json();
  if(out.ok && out.state){
    renderGrid(out.state);
    renderHUD(out.state);
  }
}

// -------------------------------
// Init
// -------------------------------
window.addEventListener("resize", () => {
  if(!isUserScrolling) getState();
});

getState();
setInterval(getState, 700);
