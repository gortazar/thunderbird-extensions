/* global browser, messenger */
"use strict";

// Spaces are not persisted: register ours every time the background starts.
async function registerSpace() {
  try {
    const existing = await messenger.spaces.query({ name: "openvidu" });
    if (existing.length === 0) {
      await messenger.spaces.create("openvidu", "sidebar/sidebar.html", {
        title: "OpenVidu Meet",
        defaultIcons: { 16: "icons/icon.svg", 32: "icons/icon.svg" },
      });
    }
  } catch (err) {
    console.error("[OpenVidu Meet] Failed to register space:", err);
  }
}

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") browser.runtime.openOptionsPage();
});

registerSpace();
