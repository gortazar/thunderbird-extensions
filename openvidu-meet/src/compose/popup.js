/* global browser, loadSettings, isConfigured, hasServerPermission, listRooms, createRoom,
   roomLinks, roomStatus, roomDisplayName, sortRooms, defaultRoomName, isSafeRoomUrl,
   invitationSnippet */
"use strict";

const $ = (id) => document.getElementById(id);

let settings = null;
let composeTabId = null;
let allRooms = [];

function setStatus(text, cls) {
  $("status").textContent = text;
  $("status").className = "status" + (cls ? " " + cls : "");
}

/**
 * Insert the invitation at the cursor. Falls back to appending it to the
 * body if the compose editor cannot be scripted.
 */
async function insertInvitation(roomName, url) {
  const snippet = invitationSnippet(roomName, url);
  const details = await browser.compose.getComposeDetails(composeTabId);
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: composeTabId },
      func: (html, text, plain) => {
        const ok = plain
          ? document.execCommand("insertText", false, text)
          : document.execCommand("insertHTML", false, html);
        return ok;
      },
      args: [snippet.html, snippet.text, details.isPlainText],
    });
    if (result && result.result) return;
  } catch (err) {
    console.warn("[OpenVidu Meet] Insert at cursor failed, appending instead:", err);
  }
  if (details.isPlainText) {
    await browser.compose.setComposeDetails(composeTabId, {
      plainTextBody: (details.plainTextBody || "") + "\n\n" + snippet.text + "\n",
    });
  } else {
    const body = details.body || "";
    const updated = /<\/body>/i.test(body)
      ? body.replace(/<\/body>/i, snippet.html + "</body>")
      : body + snippet.html;
    await browser.compose.setComposeDetails(composeTabId, { body: updated });
  }
}

async function insertRoom(room) {
  const url = roomLinks(room).speaker;
  if (!url || !isSafeRoomUrl(url, settings.serverUrl)) {
    setStatus("This room has no guest link (anonymous speaker access is disabled).", "error");
    return;
  }
  await insertInvitation(roomDisplayName(room), url);
  setStatus("✓ Link to “" + roomDisplayName(room) + "” inserted.", "success");
  setTimeout(() => window.close(), 900);
}

function renderRooms() {
  const filter = $("filter").value.trim().toLowerCase();
  const list = $("rooms");
  list.textContent = "";
  sortRooms(allRooms)
    .filter((room) => roomStatus(room) !== "closed")
    .filter((room) => !filter || roomDisplayName(room).toLowerCase().includes(filter))
    .forEach((room) => {
      const li = document.createElement("li");
      li.tabIndex = 0;
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = roomDisplayName(room);
      li.appendChild(name);
      if (roomStatus(room) === "active_meeting") {
        name.classList.add("live");
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "In meeting";
        li.appendChild(tag);
      }
      const pick = () => insertRoom(room).catch((err) => setStatus(err.message, "error"));
      li.addEventListener("click", pick);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter") pick();
      });
      list.appendChild(li);
    });
}

$("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("room-name").value.trim();
  if (!name) return;
  $("create-btn").disabled = true;
  setStatus("Creating room…");
  try {
    const room = await createRoom(settings, name, {
      autoDeletionDays: settings.autoDeletionDays,
    });
    await insertRoom(room);
  } catch (err) {
    setStatus("Could not create the room: " + err.message, "error");
  } finally {
    $("create-btn").disabled = false;
  }
});

$("filter").addEventListener("input", renderRooms);
$("open-settings").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

function showSetup(message) {
  $("setup-message").textContent = message;
  $("setup").classList.remove("hidden");
}

async function init() {
  settings = await loadSettings();
  if (!isConfigured(settings)) {
    showSetup("Configure your OpenVidu Meet server and API key first.");
    return;
  }
  if (!(await hasServerPermission(settings.serverUrl))) {
    showSetup("Thunderbird has not been allowed to contact your server. Save the settings again to grant access.");
    return;
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  composeTabId = tab.id;
  const details = await browser.compose.getComposeDetails(composeTabId);

  $("main").classList.remove("hidden");
  $("room-name").value = defaultRoomName(details.subject);
  $("room-name").select();
  $("deletion-hint").textContent =
    Number(settings.autoDeletionDays) > 0
      ? "The room is deleted automatically after " + settings.autoDeletionDays + " days."
      : "The room is kept until you delete it.";

  try {
    allRooms = await listRooms(settings);
    renderRooms();
  } catch (err) {
    setStatus("Could not load rooms: " + err.message, "error");
  }
}

init().catch((err) => setStatus(err.message, "error"));
