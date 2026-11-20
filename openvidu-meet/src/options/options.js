/* global browser, loadSettings, normalizeServerUrl, requestServerPermission, listRooms */
"use strict";

const $ = (id) => document.getElementById(id);

function setStatus(text, cls, clearAfterMs) {
  $("save-status").textContent = text;
  $("save-status").className = "save-status" + (cls ? " " + cls : "");
  if (clearAfterMs) {
    setTimeout(() => {
      $("save-status").textContent = "";
      $("save-status").className = "save-status";
    }, clearAfterMs);
  }
}

/** Read and validate the form. Returns the settings or null. */
function readForm() {
  const serverUrl = normalizeServerUrl($("server-url").value);
  if (!serverUrl) {
    $("server-url").classList.add("invalid");
    $("server-url").focus();
    setStatus("Enter a valid http:// or https:// URL, e.g. https://openvidu.example.com/meet", "error");
    return null;
  }
  $("server-url").classList.remove("invalid");
  const apiKey = $("api-key").value.trim();
  if (!apiKey) {
    $("api-key").focus();
    setStatus("The API key is required.", "error");
    return null;
  }
  const days = Math.max(0, Math.floor(Number($("auto-deletion-days").value) || 0));
  return {
    serverUrl,
    apiKey,
    participantName: $("participant-name").value.trim(),
    autoDeletionDays: days,
  };
}

/**
 * Validate, then ask for access to the server. permissions.request() must be
 * the first async call made from the click/submit handler.
 */
async function readFormAndGrant() {
  const settings = readForm();
  if (!settings) return null;
  const granted = await requestServerPermission(settings.serverUrl);
  if (!granted) {
    setStatus("Thunderbird needs access to " + new URL(settings.serverUrl).origin + " to talk to OpenVidu Meet.", "error");
    return null;
  }
  return settings;
}

$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const settings = await readFormAndGrant();
    if (!settings) return;
    await browser.storage.local.set(settings);
    $("server-url").value = settings.serverUrl;
    setStatus("✓ Settings saved", "success", 3000);
  } catch (err) {
    setStatus("Could not save the settings: " + err.message, "error");
  }
});

$("test-btn").addEventListener("click", async () => {
  try {
    const settings = await readFormAndGrant();
    if (!settings) return;
    setStatus("Testing connection…");
    const rooms = await listRooms(settings);
    setStatus("✓ Connected – " + rooms.length + " room(s) found", "success", 5000);
  } catch (err) {
    setStatus("Connection failed: " + err.message, "error");
  }
});

$("server-url").addEventListener("input", () => $("server-url").classList.remove("invalid"));

loadSettings()
  .then((settings) => {
    $("server-url").value = settings.serverUrl;
    $("api-key").value = settings.apiKey;
    $("participant-name").value = settings.participantName;
    $("auto-deletion-days").value = settings.autoDeletionDays;
  })
  .catch((err) => setStatus("Could not load the settings: " + err.message, "error"));
