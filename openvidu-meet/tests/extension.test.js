"use strict";

const fs = require("fs");
const path = require("path");
const { originPattern, withParticipantName } = require("../src/lib/settings.js");

const SRC = path.join(__dirname, "..", "src");
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));

describe("manifest", () => {
  test("is a Manifest V3 Thunderbird add-on", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.browser_specific_settings.gecko.id).toBe("openvidu-meet-provisioner@thunderbird");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("only asks for host access on demand", () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(["https://*/*", "http://*/*"]);
  });

  test("every referenced file exists", () => {
    const files = [
      ...manifest.background.scripts,
      manifest.compose_action.default_popup,
      manifest.compose_action.default_icon,
      manifest.options_ui.page,
      ...Object.values(manifest.icons),
    ];
    for (const file of files) {
      expect(fs.existsSync(path.join(SRC, file))).toBe(true);
    }
  });
});

describe("extension pages", () => {
  const pages = ["compose/popup.html", "sidebar/sidebar.html", "room/room.html", "options/options.html"];

  test.each(pages)("%s only loads local scripts that exist", (page) => {
    const html = fs.readFileSync(path.join(SRC, page), "utf8");
    const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) {
      expect(src).not.toMatch(/^https?:/);
      expect(fs.existsSync(path.join(SRC, path.dirname(page), src))).toBe(true);
    }
    expect(html).not.toMatch(/\son\w+=/i); // no inline handlers (blocked by CSP)
  });
});

describe("settings helpers", () => {
  test("originPattern covers the whole origin", () => {
    expect(originPattern("https://ov.example.com/meet")).toBe("https://ov.example.com/*");
  });

  test("withParticipantName adds the participant-name parameter", () => {
    const url = withParticipantName("https://ov.example.com/meet/room/x?secret=1", "Ana Pérez");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("secret")).toBe("1");
    expect(parsed.searchParams.get("participant-name")).toBe("Ana Pérez");
  });

  test("withParticipantName leaves the URL alone without a name", () => {
    expect(withParticipantName("https://ov.example.com/meet/room/x", "")).toBe("https://ov.example.com/meet/room/x");
  });
});
