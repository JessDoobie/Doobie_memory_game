// static/game.js
function $(id){ return document.getElementById(id); }

const code = window.MM_CODE;
const playerKey = "mm_player_id_" + code;
let playerId = localStorage.getItem(playerKey);

if(!playerId){
  // If they went directly to /play without joining, send them to join
  window.location.href = "/join";
}

// ------------------------------
// Input lock + polling pause (FIX for "first card won't stay lit")
// ------------------------------
let lockInput = false;
let pauseUntil = 0;

function pausePolling(ms){
  pauseUntil = Math.max(pauseUntil, Date.now() + ms);
}

function isMobile(){
  return window.innerWidth < 520 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ------------------------------
// Sound (per player, stored locally)
// ------------------------------
const soundKey = `mm_sound_on_${code}`;
const volKey   = `mm_sound_vol_${code}`;
let soundOn = (localStorage.getItem(soundKey) ?? "1") === "1";
let soundVol = parseFloat(localStorage.getItem(volKey) ?? "0.6");
if(Number.isNaN(soundVol)) soundVol = 0.6;

// If your HTML has these, they’ll work. If not, no problem.
function syncSoundUI(){
  const cb = $("soundToggle");
  const vol = $("volume");
  const volLabel = $("volLabel");

  if(cb) cb.checked = soundOn;
  if(vol) vol.value = String(Math.round(soundVol * 100));
  if(volLabel) volLabel.textContent = Math.round(soundVol * 100);
}

function setSound(on){
  soundOn = !!on;
  localStorage.setItem(soundKey, soundOn ? "1" : "0");
  syncSoundUI();
}

function setVolume(v){
  soundVol = Math.max(0, Math.min(1, v));
  localStorage.setItem(volKey, String(soundVol));
  syncSoundUI();
}

// tiny beep using WebAudio (works on most browsers after interaction)
let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function beep(type){
  if(!soundOn) return;
  try{
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    let freq = 660;
    let dur = 0.08;
    if(type === "match"){ freq = 880; dur = 0.09; }
    if(type === "miss"){ freq = 220; dur = 0.10; }
    if(type === "win"){ freq = 990; dur = 0.12; }

    o.type = "sine";
    o.frequency.value = freq;

    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, soundVol), audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);

    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur + 0.02);
  }catch(e){
    // ignore
  }
}

// Wire sound controls if they exist
document.addEventListener("DOMContentLoaded", () => {
  const cb = $("soundToggle");
  const vol = $("volume");
  if(cb){
    cb.addEventListener("change", () => setSound(cb.checked));
  }
  if(vol){
    vol.addEventListener("input", () => {
      const v = parseInt(vol.value, 10);
      setVolume((Number.isFinite(v) ? v : 60) / 100);
    });
  }
  syncSoundUI();
});

// ------------------------------
// Helpers
// ------------------------------
function escapeHtml(s){
  return (s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function computeColumns(size){
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  const w = window.innerWidth;

  // 4x4 should always be 4 columns
  if(size === 4) return 4;

  // 6x6:
  // - landscape / wider screens: 6 columns
  if(isLandscape || w >= 700) return 6;

  // - portrait phones: use 6 columns if the phone isn't tiny, otherwise 5
  //   (prevents 9 tall rows + scrolling)
  if(w >= 380) return 6;
  return 5;
}


// ------------------------------
// Confetti (lightweight particles)
// ------------------------------
let didConfetti = false;

function confettiBurst(){
  const host = document.body;
  if(!host) return;

  const count = 70;
  for(let i=0; i<count; i++){
    const p = document.createElement("div");
    p.className = "confetti";
    p.style.left = (Math.random()*100) + "vw";
    p.style.top = "-10px";
    p.style.transform = `rotate(${Math.random()*360}deg)`;
    p.style.opacity = "0.95";
    p.style.animationDuration = (1.4 + Math.random()*1.2) + "s";
    p.style.animationDelay = (Math.random()*0.12) + "s";
    host.appendChild(p);
    setTimeout(()=>p.remove(), 3000);
  }
}

// ------------------------------
// Match/Miss FX tracking
// ------------------------------
let prevMisses = null;
let prevMatchedSet = new Set();
let prevFinished = false;

function shakeGrid(){
  const g = $("grid");
  if(!g) return;
  g.classList.add("shake");
  setTimeout(()=>g.classList.remove("shake"), 260);
}

// ------------------------------
// Rendering
// ------------------------------
function renderGrid(state){
  const lobby = state.lobby;
  const size = lobby.size;
  const faces = state.grid.faces;
  const matched = new Set(state.grid.matched || []);

  const cols = computeColumns(size);
  const grid = $("grid");
  if(!grid) return;

  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  // Determine tile height based on screen
let h = 78;

// 6x6 needs to be more compact on phones
if(size === 6){
  if(cols === 6) h = 56;
  if(cols === 5) h = 60;

  if(window.innerHeight < 740) h -= 6;
  if(window.innerHeight < 680) h -= 6;
}

if(window.innerWidth < 380) h = Math.max(44, h - 6);


  grid.innerHTML = "";

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
      tile.textContent = "•";
    }

    tile.onclick = async () => {
      if(lockInput) return;

      // only allow flips when running
      if(lobby.status !== "running") return;

      // already revealed currently
      if(face) return;

      lockInput = true;

      // ✅ KEY FIX: prevent polling redraw from "un-revealing" the first pick
      pausePolling(isMobile() ? 2600 : 1600);

      await flip(idx);

      // keep UI stable for feedback (match/miss)
      pausePolling(isMobile() ? 1400 : 900);

      setTimeout(() => { lockInput = false; }, 220);
    };

    grid.appendChild(tile);
  });

  // Header stats
  if($("status"))  $("status").textContent  = `Status: ${lobby.status} • Players: ${lobby.player_count}/10 • Board: ${size}x${size}`;
  if($("score"))   $("score").textContent   = state.player.score;
  if($("matches")) $("matches").textContent = state.player.matches;
  if($("misses"))  $("misses").textContent  = state.player.misses;
  if($("you"))     $("you").textContent     = `You: ${state.player.name}${state.player.team ? " ("+state.player.team+")" : ""}`;
  if($("mode"))    $("mode").textContent    = `Mode: ${lobby.mode === "teams" ? "Teams" : "Solo"}`;

  if($("hint")){
    if(lobby.status === "waiting"){
      $("hint").textContent = "Waiting for host to start…";
    } else if(lobby.status === "ended"){
      $("hint").textContent = state.player.finished ? "Round ended — nice!" : "Round ended.";
    } else {
      $("hint").textContent = state.player.finished ? "✅ Finished! Watch the leaderboard." : "Find matches: +10 match, -1 miss.";
    }
  }

  // ---- Match/Miss FX (detect changes) ----
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

  prevMisses = curMisses;
  prevMatchedSet = currentMatched;

  // Win confetti once
  if(state.player.finished && !prevFinished){
    beep("win");
    if(!didConfetti){
      didConfetti = true;
      confettiBurst();
    }
  }
  prevFinished = !!state.player.finished;
}

function renderLeaderboard(lb, mode){
  const p = (lb.players || []);
  let html = `<table class="tbl"><tr><th>#</th><th>Name</th><th>Team</th><th>Score</th><th>Matches</th><th>Misses</th></tr>`;
  p.slice(0, 10).forEach((r, i) => {
    html += `<tr><td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.team||"")}</td><td>${r.score}</td><td>${r.matches}</td><td>${r.misses}</td></tr>`;
  });
  html += `</table>`;
  if($("lb")) $("lb").innerHTML = html;

  if(mode === "teams" && (lb.teams||[]).length){
    if($("teamsBox")){
      $("teamsBox").style.display = "block";
      let th = `<div class="card inner"><h4>Teams (best 3 combined)</h4>`;
      th += `<table class="tbl"><tr><th>#</th><th>Team</th><th>Score</th><th>Top 3</th></tr>`;
      lb.teams.forEach((t, i) => {
        th += `<tr><td>${i+1}</td><td>${escapeHtml(t.team)}</td><td>${t.score}</td><td>${escapeHtml((t.members||[]).join(", "))}</td></tr>`;
      });
      th += `</table></div>`;
      $("teamsBox").innerHTML = th;
    }
  } else {
    if($("teamsBox")){
      $("teamsBox").style.display = "none";
      $("teamsBox").innerHTML = "";
    }
  }
}

// ------------------------------
// Networking
// ------------------------------
async function getState(){
  // ✅ critical: don't overwrite UI while mid-turn
  if(Date.now() < pauseUntil) return;

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
    if(warm) warm.style.display = "none";

    renderGrid(out.state);
    renderLeaderboard(out.leaderboard, out.state.lobby.mode);
  } catch (e) {
    // Keep warmup visible while server wakes up
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
      // render immediately from flip response
      renderGrid(out.state);

      // ✅ Optional upgrade: longer protected window on mobile
      pausePolling(isMobile() ? 1800 : 1200);
    }
  }catch(e){
    // ignore
  }
}

window.addEventListener("resize", () => {
  getState();
});

// Kick things off
getState();

// Poll server state (slower on mobile = less mid-turn overwrite)
setInterval(getState, isMobile() ? 1100 : 750);
