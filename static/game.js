// -------------------------------
// Helpers
// -------------------------------
function $(id){ return document.getElementById(id); }
function renderStats(player){
  if(!player) return;

  $("score").textContent   = player.score ?? 0;
  $("matches").textContent = player.matches ?? 0;
  $("misses").textContent  = player.misses ?? 0;
}


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
let stateInFlight = false;
let stateQueued = false;

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

function computeColumns(totalCards){
  const w = window.innerWidth;

  // Phones
  if (w <= 480) {
    if (totalCards <= 16) return 4;   // 4x4
    if (totalCards <= 20) return 4;   // 4x5
    if (totalCards <= 24) return 4;   // 4x6
    if (totalCards <= 30) return 5;   // 5x6
  }

  // Tablets / desktop
  if (totalCards <= 20) return 5;
  if (totalCards <= 24) return 6;
  if (totalCards <= 30) return 6;

  return 6;
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
  // STEP 2D — tighten grid gap on phones
grid.style.gap = window.innerWidth <= 480 ? "6px" : "10px";

 // Responsive tile height (mobile-safe)
let h = 76;
const total = gridState.faces.length;

if (window.innerWidth <= 480) {
  if (total >= 30) h = 52;
  else if (total >= 24) h = 56;
  else h = 62;
} else if (window.innerHeight < 720) {
  h = 66;
}


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
function renderHUD(state){
  const p = state?.player;
  if(!p) return;

  $("score").textContent   = p.score   ?? 0;
  $("matches").textContent = p.matches ?? 0;
  $("misses").textContent  = p.misses  ?? 0;
}


// -------------------------------
// Network
// -------------------------------
async function getState(){
  if (stateInFlight) { 
    stateQueued = true; 
    return; 
  }
  stateInFlight = true;

  try {
    const res = await fetch(`/api/state/${code}/${playerId}`);
    const out = await res.json();

    if(!out.ok){
      localStorage.removeItem(playerKey);
      window.location.href = "/join";
      return;
    }

    // Hide warmup once server responds
    const warm = document.getElementById("warmup");
    if (warm) warm.style.display = "none";

    // ✅ THESE THREE MUST ALWAYS RUN TOGETHER
    renderGrid(out.state);
    renderHUD(out.state);                 // ← THIS IS THE FIX
    renderLeaderboard(out.leaderboard);

  } catch (e) {
    // ignore; keep warmup if needed
  } finally {
    stateInFlight = false;
    if (stateQueued) {
      stateQueued = false;
      getState(); // catch up once
    }
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
setInterval(getState, 1100);

