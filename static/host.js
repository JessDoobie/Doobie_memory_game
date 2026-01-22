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

  const body = {
    mode: $("mode").value,
    entry_mode: $("entry").value,
    rows,
    cols
  };

  $("createStatus").textContent = "Creating lobby…";

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
  showLobby(out.lobby);
}

function showLobby(lobby) {
  $("lobbyBox").style.display = "block";
  $("codePill").textContent = lobby.code;

  $("joinLink").textContent  = location.origin + "/join";
  $("playLink").textContent  = location.origin + "/play/" + lobby.code;
  $("watchLink").textContent = location.origin + "/watch/" + lobby.code;

  $("startBtn").onclick = async () => {
    await fetch(`/api/host/start_round/${lobby.code}`, {
      method: "POST"
    });
  };
}

document.addEventListener("DOMContentLoaded", () => {
  $("createLobbyBtn").addEventListener("click", createLobby);
});



