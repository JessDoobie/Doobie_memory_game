console.log("watch.js loaded");

const code = window.MM_WATCH_CODE;
if (!code) {
  console.error("No watch code found");
}

/* -------------------------
   Mini board renderer
------------------------- */
function renderMiniBoard(player, cols) {
  const grid = document.createElement("div");
  grid.className = "watch-grid";
  grid.style.setProperty("--cols", cols);

  player.faces.forEach(face => {
    const cell = document.createElement("div");
    cell.className = "watch-tile";

    // purple for hidden, dark for revealed
    cell.style.background = face ? "#1f2937" : "#2e1065";
    cell.textContent = face || "";

    grid.appendChild(cell);
  });

  return grid;
}



/* -------------------------
   Fetch + render watcher view
------------------------- */
async function fetchWatchState() {
  try {
    const res = await fetch(`/api/watch/${code}`);
    const data = await res.json();

    if (!data.ok) return;

    const lb = document.getElementById("lb");
    if (!lb) return;

    lb.innerHTML = "";

    const sorted = [...data.players].sort((a, b) => b.score - a.score);

    sorted.forEach((p, i) => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.marginBottom = "12px";
      
      if (i === 0) card.classList.add("winner-1");
      if (i === 1) card.classList.add("winner-2");
      if (i === 2) card.classList.add("winner-3");

      const title = document.createElement("div");
      title.className = "pill";
      title.textContent = `${p.name} — ${p.score} pts`;

      card.appendChild(title);
      card.appendChild(renderMiniBoard(p, data.lobby.cols));

      lb.appendChild(card);
    });

  } catch (err) {
    console.error("Watch fetch failed", err);
  }
}

/* -------------------------
   Start polling
------------------------- */
fetchWatchState();
setInterval(fetchWatchState, 1000);
