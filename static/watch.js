console.log("watch.js loaded");

const code = window.MM_WATCH_CODE;
if (!code) {
  console.error("No watch code found");
}

async function fetchWatchState() {
  try {
    const res = await fetch(`/api/watch/${code}`);
    const data = await res.json();
    console.log("WATCH STATE:", data);

    if (!data.ok) return;

    const lb = document.getElementById("lb");
    lb.innerHTML = "";

    data.players.forEach(p => {
      const row = document.createElement("div");
      row.className = "pill";
      row.textContent = `${p.name} — ${p.score} pts`;
      lb.appendChild(row);
    });

  } catch (err) {
    console.error("Watch fetch failed", err);
  }
}


// Fetch immediately
fetchWatchState();

// Then refresh every second
setInterval(fetchWatchState, 1000);
