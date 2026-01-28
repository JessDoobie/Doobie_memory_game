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
  } catch (err) {
    console.error("Watch fetch failed", err);
  }
}

// Fetch immediately
fetchWatchState();

// Then refresh every second
setInterval(fetchWatchState, 1000);
