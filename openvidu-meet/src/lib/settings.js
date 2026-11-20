/* global browser, normalizeServerUrl */
/**
 * Settings shared by every extension page. Requires lib/meet.js.
 */

"use strict";

const DEFAULT_SETTINGS = {
  serverUrl: "",
  apiKey: "",
  participantName: "",
  // Rooms created from the compose window are deleted after this many days
  // (0 = never), so one-off meeting rooms do not pile up on the server.
  autoDeletionDays: 30,
};

async function loadSettings() {
  const stored = await browser.storage.local.get(DEFAULT_SETTINGS);
  stored.serverUrl = normalizeServerUrl(stored.serverUrl) || "";
  return stored;
}

function isConfigured(settings) {
  return Boolean(settings.serverUrl && settings.apiKey);
}

/** Match pattern for the host permission the server needs. */
function originPattern(serverUrl) {
  return new URL(serverUrl).origin + "/*";
}

async function hasServerPermission(serverUrl) {
  try {
    return await browser.permissions.contains({ origins: [originPattern(serverUrl)] });
  } catch (_) {
    return false;
  }
}

/**
 * Ask for access to the server. Must be called directly from a user action
 * (click / submit handler), before any await.
 */
function requestServerPermission(serverUrl) {
  return browser.permissions.request({ origins: [originPattern(serverUrl)] });
}

/** Display name passed to the meeting, if the user set one. */
function withParticipantName(url, participantName) {
  if (!participantName) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("participant-name", participantName);
  return parsed.toString();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULT_SETTINGS, originPattern, withParticipantName };
}
