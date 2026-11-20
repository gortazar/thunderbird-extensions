/* global browser, loadSettings, isConfigured, hasServerPermission, listRooms, createRoom,
   roomLinks, roomStatus, roomDisplayName, sortRooms, isSafeRoomUrl */
"use strict";

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 30000;
const STATUS_LABEL = { active_meeting: "In meeting", open: "Open", closed: "Closed" };

let settings = null;
let statusTimer = null;

function setStatus(text, cls, clearAfterMs) {
  clearTimeout(statusTimer);
  $("status-message").textContent = text;
  $("status-message").className = "status-message" + (cls ? " " + cls : "");
  if (clearAfterMs) statusTimer = setTimeout(() => setStatus("", ""), clearAfterMs);
}

function joinRoom(room) {
  const url = roomLinks(room).moderator;
  if (!url || !isSafeRoomUrl(url, settings.serverUrl)) {
    setStatus("This room has no host link (anonymous moderator access is disabled).", "error");
    return;
  }
  const page =
    browser.runtime.getURL("room/room.html") +
    "?" +
    new URLSearchParams({ url, name: roomDisplayName(room) });
  browser.tabs.create({ url: page });
}

async function copyGuestLink(room) {
  const url = roomLinks(room).speaker;
  if (!url || !isSafeRoomUrl(url, settings.serverUrl)) {
    setStatus("This room has no guest link.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    setStatus("✓ Guest link copied", "success", 3000);
  } catch (err) {
    setStatus("Could not copy the link: " + err.message, "error");
  }
}

function buildRoomItem(room) {
  const status = roomStatus(room);
  const li = document.createElement("li");
  li.className = "room-item room-" + status;

  const main = document.createElement("button");
  main.className = "room-main";
  main.disabled = status === "closed";
  main.title = status === "closed" ? "Room closed" : "Join as host";
  main.addEventListener("click", () => joinRoom(room));

  const name = document.createElement("span");
  name.className = "room-name";
  name.textContent = roomDisplayName(room);
  main.appendChild(name);

  const badge = document.createElement("span");
  badge.className = "room-badge badge-" + status;
  badge.textContent = STATUS_LABEL[status];
  main.appendChild(badge);
  li.appendChild(main);

  if (status !== "closed") {
    const copy = document.createElement("button");
    copy.className = "icon-btn copy-btn";
    copy.title = "Copy guest link";
    copy.setAttribute("aria-label", "Copy guest link for " + roomDisplayName(room));
    copy.textContent = "⧉";
    copy.addEventListener("click", () => copyGuestLink(room));
    li.appendChild(copy);
  }
  return li;
}

async function loadRooms() {
  settings = await loadSettings();
  const list = $("rooms-list");
  $("empty-state").classList.add("hidden");

  if (!isConfigured(settings)) {
    list.textContent = "";
    setStatus("Configure the server URL and API key in Settings (⚙).", "warning");
    return;
  }
  if (!(await hasServerPermission(settings.serverUrl))) {
    list.textContent = "";
    setStatus("Access to your server has not been granted. Open Settings (⚙) and save again.", "warning");
    return;
  }

  if (!list.hasChildNodes()) setStatus("Loading rooms…", "loading");
  try {
    const rooms = await listRooms(settings);
    list.textContent = "";
    if ($("status-message").classList.contains("loading") ||
        $("status-message").classList.contains("error")) {
      setStatus("", "");
    }
    if (rooms.length === 0) {
      $("empty-state").classList.remove("hidden");
      return;
    }
    sortRooms(rooms).forEach((room) => list.appendChild(buildRoomItem(room)));
  } catch (err) {
    setStatus("Failed to load rooms: " + err.message, "error");
  }
}

$("new-btn").addEventListener("click", () => {
  $("new-form").classList.toggle("hidden");
  if (!$("new-form").classList.contains("hidden")) $("new-name").focus();
});

$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("new-name").value.trim();
  if (!name || !settings || !isConfigured(settings)) return;
  $("new-submit").disabled = true;
  try {
    const room = await createRoom(settings, name, {});
    $("new-name").value = "";
    $("new-form").classList.add("hidden");
    setStatus("✓ Room “" + roomDisplayName(room) + "” created", "success", 3000);
    await loadRooms();
  } catch (err) {
    setStatus("Could not create the room: " + err.message, "error");
  } finally {
    $("new-submit").disabled = false;
  }
});

$("refresh-btn").addEventListener("click", loadRooms);
$("settings-btn").addEventListener("click", () => browser.runtime.openOptionsPage());

const timer = setInterval(() => {
  if (document.visibilityState === "visible") loadRooms();
}, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadRooms();
});
window.addEventListener("unload", () => clearInterval(timer));
browser.storage.onChanged.addListener(loadRooms);

loadRooms();
