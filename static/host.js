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
    const res = await fetch("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const out = await res.json();

    if (!out.ok) {
      $("createStatus").textContent = out.error || "Failed to create lobby";
      return;
    }

    currentLobbyCode = out.code;
    $("createStatus").textContent = "Lobby created ✅";
    showLobby({ code: out.code });

  } catch (err) {
    $("createStatus").textContent = "Network error creating lobby";
  }
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



