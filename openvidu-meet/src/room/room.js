/* global browser, messenger, loadSettings, isSafeRoomUrl, withParticipantName */
"use strict";

const params = new URLSearchParams(window.location.search);
const roomUrl = params.get("url") || "";
const roomName = params.get("name") || "OpenVidu Meet";

const iframe = document.getElementById("room-frame");
let joinUrl = null;

function showError(message) {
  document.getElementById("error-message").textContent = message;
  document.getElementById("error-overlay").classList.remove("hidden");
}

async function init() {
  const settings = await loadSettings();
  document.title = "OpenVidu Meet – " + roomName;
  document.getElementById("room-title").textContent = roomName;

  // Only load links that point to the configured server.
  if (!isSafeRoomUrl(roomUrl, settings.serverUrl)) {
    showError("This room link does not belong to your OpenVidu Meet server. Open the room again from the sidebar.");
    return;
  }
  joinUrl = withParticipantName(roomUrl, settings.participantName);
  iframe.src = joinUrl;
}

document.getElementById("open-external-btn").addEventListener("click", () => {
  if (joinUrl) messenger.windows.openDefaultBrowser(joinUrl);
});

document.getElementById("close-btn").addEventListener("click", async () => {
  const tab = await browser.tabs.getCurrent();
  if (tab) browser.tabs.remove(tab.id);
});

init().catch((err) => showError(err.message));
