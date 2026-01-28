console.log("host.js file executed");

function $(id) {
  return document.getElementById(id);
}

const params = new URLSearchParams(window.location.search);
const HOST_KEY = params.get("host_key") || "";

let currentLobbyCode = null;


function boardPresetToRowsCols(preset) {
  const [cols, rows] = preset.split("x").map(Number);
  return { rows, cols };
}

async function createLobby() {
  const preset = $("boardPreset").value;
  const { rows, cols } = boardPresetToRowsCols(preset);

  $("createStatus").textContent = "Creating lobby…";

  const body = {
    mode: $("mode").value,
    entry: $("entry").value,
    board: preset,
    host_key: HOST_KEY   // ✅ THIS IS THE KEY FIX
  };

  try {
   const res = await fetch("/api/host/create_lobby", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Host-Key": HOST_KEY
  },
  body: JSON.stringify(body)
});

    const out = await res.json();

    if (!out.ok) {
      $("createStatus").textContent = out.error || "Failed to create lobby";
      return;
    }

currentLobbyCode = out.lobby.code;
console.log("✅ createLobby set currentLobbyCode:", currentLobbyCode);
$("createStatus").textContent = "Lobby created ✅";
showLobby(out.lobby);



  } catch (err) {
    $("createStatus").textContent = "Network error creating lobby";
  }
}


function showLobby(lobby) {
  currentLobbyCode = lobby.code;

  // Show lobby panel
  $("lobbyBox").style.display = "block";

  // Show code
  $("codePill").textContent = lobby.code;

  // Build links
  const base = window.location.origin;
  $("joinLink").textContent  = base + "/join";
  $("playLink").textContent  = base + "/play/" + lobby.code;
  $("watchLink").textContent = base + "/watch/" + lobby.code;

  // Start button
  const startBtn = $("startBtn");
  if (startBtn) {
    startBtn.onclick = async () => {
      await fetch(`/api/host/start_round/${currentLobbyCode}`, {
        method: "POST",
        headers: {
          "X-Host-Key": HOST_KEY
        }
      });
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = $("createLobbyBtn");
  console.log("Create Lobby button found:", btn);

  if (!btn) {
    console.error("❌ createLobbyBtn not found in DOM");
    return;
  }

  btn.addEventListener("click", createLobby);
});


