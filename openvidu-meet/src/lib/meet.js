/**
 * OpenVidu Meet REST API client and helpers.
 *
 * Loaded as a classic script by the extension pages (globals) and with
 * require() by the Jest tests. Targets the OpenVidu Meet 3.9 REST API:
 * https://openvidu.io/3.9/meet/embedded/reference/rest-api/
 */

"use strict";

const MAX_ROOM_NAME_LENGTH = 50;
const MAX_PAGES = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normalise the server URL typed by the user: OpenVidu Meet is served under a
 * base path (`/meet` by default), so the path is kept. Query, fragment and
 * trailing slashes are dropped. Only http(s) URLs are accepted.
 *
 * "https://example.com/meet/" -> "https://example.com/meet"
 *
 * @param {string|null|undefined} input
 * @returns {string|null} normalised URL, or null when invalid
 */
function normalizeServerUrl(input) {
  if (!input || typeof input !== "string") return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch (_) {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return url.origin + path;
}

/** Full URL of a REST API endpoint, e.g. apiUrl(server, "/rooms"). */
function apiUrl(serverUrl, path) {
  return serverUrl + "/api/v1" + path;
}

/**
 * True when `url` is an http(s) URL on the same origin as the configured
 * server. Room links come from the server, but we still refuse to open or
 * insert anything that points elsewhere.
 */
function isSafeRoomUrl(url, serverUrl) {
  if (!url || !serverUrl) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return parsed.origin === new URL(serverUrl).origin;
  } catch (_) {
    return false;
  }
}

/**
 * Anonymous access links of a room.
 * Meet 3.8+ exposes them in `access.anonymous.{moderator,speaker}.url`;
 * older releases used top-level `moderatorUrl` / `speakerUrl`.
 *
 * @returns {{moderator: string|null, speaker: string|null}}
 */
function roomLinks(room) {
  const anon = (room && room.access && room.access.anonymous) || {};
  const pick = (role, legacyField) => {
    const entry = anon[role];
    if (entry) return entry.enabled === false ? null : entry.url || null;
    return (room && room[legacyField]) || null;
  };
  return {
    moderator: pick("moderator", "moderatorUrl"),
    speaker: pick("speaker", "speakerUrl"),
  };
}

/** "active_meeting" | "open" | "closed" (unknown values count as "open"). */
function roomStatus(room) {
  const status = room && room.status;
  if (status === "active_meeting" || status === "closed") return status;
  return "open";
}

function roomDisplayName(room) {
  return (room && (room.roomName || room.roomId)) || "(unnamed)";
}

const STATUS_ORDER = { active_meeting: 0, open: 1, closed: 2 };

/** Rooms with a meeting in progress first, then open, then closed; by name. */
function sortRooms(rooms) {
  return [...rooms].sort((a, b) => {
    const byStatus = STATUS_ORDER[roomStatus(a)] - STATUS_ORDER[roomStatus(b)];
    if (byStatus !== 0) return byStatus;
    return roomDisplayName(a).localeCompare(roomDisplayName(b), undefined, {
      sensitivity: "base",
    });
  });
}

/**
 * Suggested room name for a message: its subject without reply/forward
 * prefixes, cut to the 50 characters the API accepts.
 */
function defaultRoomName(subject) {
  let name = (subject || "").trim();
  const prefix = /^(re|fw|fwd|rv|aw|wg|sv|vs|tr)\s*(\[\d+\])?\s*:\s*/i;
  while (prefix.test(name)) name = name.replace(prefix, "");
  name = name.replace(/\s+/g, " ").trim();
  if (!name) name = "Meeting";
  return name.slice(0, MAX_ROOM_NAME_LENGTH).trim();
}

/** Error raised for a failed REST call; `status` is the HTTP status. */
class MeetApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "MeetApiError";
    this.status = status;
  }
}

function describeHttpError(status, body) {
  const detail = body && (body.message || body.error);
  if (status === 401) return "The API key was rejected (HTTP 401). Check it in the settings.";
  if (status === 404) {
    return "OpenVidu Meet API not found (HTTP 404). Check the server URL; it usually ends in /meet.";
  }
  return "HTTP " + status + (detail ? " – " + detail : "");
}

/**
 * Perform an authenticated REST call.
 * @param {{serverUrl: string, apiKey: string}} settings
 */
async function meetRequest(settings, method, path, body, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const headers = { Accept: "application/json", "X-API-KEY": settings.apiKey || "" };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await doFetch(apiUrl(settings.serverUrl, path), init);
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }
  if (!response.ok) {
    throw new MeetApiError(response.status, describeHttpError(response.status, data));
  }
  // Without the base path, some deployments answer 200 with an empty or HTML
  // body instead of a 404, so a successful call must still return JSON.
  if (data === null || typeof data !== "object") {
    throw new MeetApiError(
      response.status,
      "The server did not answer like the OpenVidu Meet API. Check the server URL; it usually ends in /meet."
    );
  }
  return data;
}

/** All rooms, following `pagination.nextPageToken`. */
async function listRooms(settings, fetchImpl) {
  const rooms = [];
  let token = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ maxItems: "100" });
    if (token) query.set("nextPageToken", token);
    const data = await meetRequest(settings, "GET", "/rooms?" + query, undefined, fetchImpl);
    if (data && Array.isArray(data.rooms)) rooms.push(...data.rooms);
    const pagination = (data && data.pagination) || {};
    token = pagination.isTruncated ? pagination.nextPageToken : null;
    if (!token) break;
  }
  return rooms;
}

/**
 * Create a room. With `autoDeletionDays` > 0 the room is deleted that many
 * days from now (the API requires at least one hour in the future).
 */
async function createRoom(settings, roomName, options, fetchImpl) {
  const body = { roomName: defaultRoomName(roomName) };
  const days = Number(options && options.autoDeletionDays);
  if (Number.isFinite(days) && days > 0) {
    body.autoDeletionDate = Date.now() + days * DAY_MS;
  }
  return meetRequest(settings, "POST", "/rooms", body, fetchImpl);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Text inserted into a message to invite people to a room.
 * @returns {{html: string, text: string}}
 */
function invitationSnippet(roomName, url) {
  const label = "Join the video call";
  return {
    text: label + " (" + roomName + "): " + url,
    html:
      "<p>" + label + ": <a href=\"" + escapeHtml(url) + "\">" +
      escapeHtml(roomName) + "</a><br>" + escapeHtml(url) + "</p>",
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MAX_ROOM_NAME_LENGTH,
    MeetApiError,
    normalizeServerUrl,
    apiUrl,
    isSafeRoomUrl,
    roomLinks,
    roomStatus,
    roomDisplayName,
    sortRooms,
    defaultRoomName,
    meetRequest,
    listRooms,
    createRoom,
    escapeHtml,
    invitationSnippet,
  };
}
