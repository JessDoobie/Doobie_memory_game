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
  grid.className = "miniBoard";

  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gap = "6px";

  player.faces.forEach(face => {
    const cell = document.createElement("div");
    cell.className = "miniCell";

    cell.style.width = "32px";
    cell.style.height = "32px";
    cell.style.display = "flex";
    cell.style.alignItems = "center";
    cell.style.justifyContent = "center";
    cell.style.borderRadius = "6px";
    

    // ✅ purple for unflipped
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

    data.players.forEach(p => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.marginBottom = "12px";

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
