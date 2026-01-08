function $(id){ return document.getElementById(id); }

const code = window.MM_CODE;
const playerKey = "mm_player_id_" + code;
let playerId = localStorage.getItem(playerKey);

if(!playerId){
  window.location.href = "/join";
}

let lockInput = false;

/* ------------------------------
   PER-PLAYER SOUND SETTINGS
--------------------------------*/
const soundKey = `mm_sound_${code}_${playerId}`;
const volKey   = `mm_vol_${code}_${playerId}`;

function loadSoundPrefs(){
  const enabled = localStorage.getItem(soundKey);
  const vol = localStorage.getItem(volKey);

  const enabledBool = (enabled === null) ? true : (enabled === "1");
  const volNum = (vol === null) ? 45 : Math.max(0, Math.min(100, parseInt(vol, 10) || 45));

  return { enabled: enabledBool, vol: volNum };
}

function saveSoundPrefs(enabled, vol){
  localStorage.setItem(soundKey, enabled ? "1" : "0");
  localStorage.setItem(volKey, String(vol));
}

let SOUND = loadSoundPrefs();

/* ------------------------------
   FX STATE + AUDIO ENGINE
--------------------------------*/
let prevMisses = null;
let prevMatchedSet = new Set();
let prevFinished = false;

let audioCtx = null;

function ensureAudio(){
  if(!SOUND.enabled) return;

  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(Ctx) audioCtx = new Ctx();
  }
  if(audioCtx && audioCtx.state === "suspended"){
    audioCtx.resume().catch(()=>{});
  }
}

function playTone(type){
  if(!SOUND.enabled) return;
  ensureAudio();
  if(!audioCtx) return;

  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);

  // Volume scaling (0..100 -> 0..1)
  const V = Math.max(0, Math.min(1, SOUND.vol / 100));
  const peak = 0.22 * V; // master peak

  if(type === "match"){
    o.type = "triangle";
    o.frequency.setValueAtTime(740, t0);
    o.frequency.exponentialRampToValueAtTime(980, t0 + 0.08);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.start(t0);
    o.stop(t0 + 0.16);
  } else if(type === "miss"){
    o.type = "sine";
    o.frequency.setValueAtTime(220, t0);
    o.frequency.exponentialRampToValueAtTime(160, t0 + 0.10);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.start(t0);
    o.stop(t0 + 0.18);
  } else if(type === "win"){
    // little 2-tone celebration
    o.type = "triangle";
    o.frequency.setValueAtTime(660, t0);
    o.frequency.exponentialRampToValueAtTime(990, t0 + 0.10);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.start(t0);
    o.stop(t0 + 0.24);
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
   CONFETTI (canvas)
--------------------------------*/
let confettiRunning = false;

function startConfetti(){
  const canvas = $("confetti");
  if(!canvas || confettiRunning) return;

  confettiRunning = true;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  function resize(){
    canvas.style.display = "block";
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener("resize", resize);

  const W = () => canvas.width;
  const H = () => canvas.height;

  const pieces = [];
  const N = 140;

  for(let i=0;i<N;i++){
    pieces.push({
      x: Math.random() * W(),
      y: -Math.random() * H()*0.7,
      r: 3 + Math.random()*6,
      vy: 1.5 + Math.random()*3.8,
      vx: -1 + Math.random()*2,
      rot: Math.random()*Math.PI,
      vr: -0.15 + Math.random()*0.3,
      a: 1
    });
  }

  const start = performance.now();
  const duration = 2600; // ms

  function draw(ts){
    const t = ts - start;
    ctx.clearRect(0,0,W(),H());

    pieces.forEach(p=>{
      p.x += p.vx * dpr;
      p.y += p.vy * dpr;
      p.rot += p.vr;

      // fade out near end
      const k = Math.min(1, Math.max(0, (duration - t)/700));
      p.a = k;

      ctx.save();
      ctx.globalAlpha = p.a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // random-ish colors without specifying a palette array
      ctx.fillStyle = `hsl(${Math.floor((p.x+p.y) % 360)}, 90%, 60%)`;
      ctx.fillRect(-p.r, -p.r, p.r*2, p.r*1.2);
      ctx.restore();
    });

    if(t < duration){
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0,0,W(),H());
      canvas.style.display = "none";
      confettiRunning = false;
      window.removeEventListener("resize", resize);
    }
  }

  requestAnimationFrame(draw);
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
   UI: Sound controls wiring
--------------------------------*/
function initSoundControls(){
  const chk = $("soundEnabled");
  const rng = $("soundVol");
  if(!chk || !rng) return;

  chk.checked = SOUND.enabled;
  rng.value = String(SOUND.vol);

  chk.addEventListener("change", ()=>{
    SOUND.enabled = chk.checked;
    saveSoundPrefs(SOUND.enabled, SOUND.vol);
    if(SOUND.enabled) ensureAudio();
  });

  rng.addEventListener("input", ()=>{
    SOUND.vol = parseInt(rng.value || "45", 10);
    saveSoundPrefs(SOUND.enabled, SOUND.vol);
  });

  // unlock audio on first tap anywhere
  document.addEventListener("pointerdown", ensureAudio, { once: true });
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
  const curMisses = state.player.misses;
  const currentMatched = new Set(state.grid.matched || []);

  // newly matched tiles
  const newlyMatched = [];
  currentMatched.forEach(i => {
    if(!prevMatchedSet.has(i)) newlyMatched.push(i);
  });

  if(newlyMatched.length){
    playTone("match");
    newlyMatched.forEach(i => {
      const btn = grid.querySelector(`.tile[data-idx="${i}"]`);
      if(btn){
        btn.classList.add("match-pop");
        setTimeout(()=>btn.classList.remove("match-pop"), 260);
      }
    });
  }

  // miss increased
  if(prevMisses !== null && curMisses > prevMisses){
    playTone("miss");
    shakeGrid();
  }

  // confetti on win transition
  const finishedNow = !!state.player.finished;
  if(finishedNow && !prevFinished){
    playTone("win");
    startConfetti();
  }

  prevMisses = curMisses;
  prevMatchedSet = currentMatched;
  prevFinished = finishedNow;
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

/* ------------------------------
   INIT
--------------------------------*/
initSoundControls();
getState();
setInterval(getState, 750);
