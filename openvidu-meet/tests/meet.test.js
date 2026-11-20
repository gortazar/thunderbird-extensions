"use strict";

const meet = require("../src/lib/meet.js");

const SERVER = "https://ov.example.com/meet";
const SETTINGS = { serverUrl: SERVER, apiKey: "key-123" };

/** Room shaped like the OpenVidu Meet 3.9 MeetRoom schema. */
function room(overrides = {}) {
  return {
    roomId: "daily-abc",
    roomName: "Daily",
    status: "open",
    access: {
      anonymous: {
        moderator: { enabled: true, url: SERVER + "/room/daily-abc?secret=mod" },
        speaker: { enabled: true, url: SERVER + "/room/daily-abc?secret=spk" },
      },
      user: { enabled: false, url: SERVER + "/room/daily-abc" },
    },
    ...overrides,
  };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("normalizeServerUrl", () => {
  test.each([
    ["https://ov.example.com/meet", "https://ov.example.com/meet"],
    ["https://ov.example.com/meet/", "https://ov.example.com/meet"],
    ["  https://ov.example.com/meet/?x=1#y ", "https://ov.example.com/meet"],
    ["https://ov.example.com", "https://ov.example.com"],
    ["http://localhost:9080/meet", "http://localhost:9080/meet"],
  ])("%s -> %s", (input, expected) => {
    expect(meet.normalizeServerUrl(input)).toBe(expected);
  });

  test.each(["", null, "not a url", "javascript:alert(1)", "file:///etc/passwd",
    "ftp://ov.example.com", "https://user:pw@ov.example.com/meet"])(
    "rejects %p", (input) => {
      expect(meet.normalizeServerUrl(input)).toBeNull();
    });
});

describe("apiUrl", () => {
  test("keeps the base path", () => {
    expect(meet.apiUrl(SERVER, "/rooms")).toBe("https://ov.example.com/meet/api/v1/rooms");
  });
});

describe("isSafeRoomUrl", () => {
  test("accepts links on the server origin", () => {
    expect(meet.isSafeRoomUrl(SERVER + "/room/x?secret=1", SERVER)).toBe(true);
  });
  test("rejects other origins and schemes", () => {
    expect(meet.isSafeRoomUrl("https://evil.example.com/room/x", SERVER)).toBe(false);
    expect(meet.isSafeRoomUrl("javascript:alert(1)", SERVER)).toBe(false);
    expect(meet.isSafeRoomUrl("", SERVER)).toBe(false);
    expect(meet.isSafeRoomUrl(SERVER + "/room/x", "")).toBe(false);
  });
});

describe("roomLinks", () => {
  test("reads access.anonymous URLs", () => {
    expect(meet.roomLinks(room())).toEqual({
      moderator: SERVER + "/room/daily-abc?secret=mod",
      speaker: SERVER + "/room/daily-abc?secret=spk",
    });
  });
  test("returns null for a disabled role", () => {
    const r = room();
    r.access.anonymous.speaker.enabled = false;
    expect(meet.roomLinks(r).speaker).toBeNull();
    expect(meet.roomLinks(r).moderator).not.toBeNull();
  });
  test("falls back to legacy moderatorUrl / speakerUrl", () => {
    const legacy = { roomId: "r", moderatorUrl: "m", speakerUrl: "s" };
    expect(meet.roomLinks(legacy)).toEqual({ moderator: "m", speaker: "s" });
  });
  test("handles missing data", () => {
    expect(meet.roomLinks({})).toEqual({ moderator: null, speaker: null });
    expect(meet.roomLinks(null)).toEqual({ moderator: null, speaker: null });
  });
});

describe("roomStatus and sortRooms", () => {
  test("unknown status counts as open", () => {
    expect(meet.roomStatus({})).toBe("open");
    expect(meet.roomStatus({ status: "closed" })).toBe("closed");
  });
  test("meetings in progress first, closed last, then by name", () => {
    const rooms = [
      room({ roomName: "zeta", status: "closed" }),
      room({ roomName: "beta" }),
      room({ roomName: "Alpha" }),
      room({ roomName: "live", status: "active_meeting" }),
    ];
    expect(meet.sortRooms(rooms).map((r) => r.roomName)).toEqual(["live", "Alpha", "beta", "zeta"]);
  });
});

describe("defaultRoomName", () => {
  test.each([
    ["Re: Project kickoff", "Project kickoff"],
    ["RE: Fwd: RV: Budget", "Budget"],
    ["Re[2]: Weekly", "Weekly"],
    ["", "Meeting"],
    [undefined, "Meeting"],
    ["  spaces   inside  ", "spaces inside"],
  ])("%p -> %p", (subject, expected) => {
    expect(meet.defaultRoomName(subject)).toBe(expected);
  });
  test("cuts to 50 characters", () => {
    expect(meet.defaultRoomName("x".repeat(80))).toHaveLength(meet.MAX_ROOM_NAME_LENGTH);
  });
});

describe("listRooms", () => {
  test("sends the API key and follows pagination", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, {
        rooms: [room({ roomName: "a" })],
        pagination: { isTruncated: true, nextPageToken: "tok", maxItems: 100 },
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        rooms: [room({ roomName: "b" })],
        pagination: { isTruncated: false, nextPageToken: null, maxItems: 100 },
      }));

    const rooms = await meet.listRooms(SETTINGS, fetchMock);

    expect(rooms.map((r) => r.roomName)).toEqual(["a", "b"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(firstUrl).toBe(SERVER + "/api/v1/rooms?maxItems=100");
    expect(firstInit.method).toBe("GET");
    expect(firstInit.headers["X-API-KEY"]).toBe("key-123");
    expect(fetchMock.mock.calls[1][0]).toBe(SERVER + "/api/v1/rooms?maxItems=100&nextPageToken=tok");
  });

  test("explains a 401", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(401, { error: "Authentication Error", message: "Unauthorized" }));
    await expect(meet.listRooms(SETTINGS, fetchMock)).rejects.toThrow(/API key/);
  });

  test("hints at the base path on a 404", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(404, null));
    await expect(meet.listRooms(SETTINGS, fetchMock)).rejects.toThrow(/\/meet/);
  });

  test("rejects a 200 that is not JSON (server URL without /meet)", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });
    await expect(meet.listRooms(SETTINGS, fetchMock)).rejects.toThrow(/\/meet/);
    await expect(meet.createRoom(SETTINGS, "x", {}, fetchMock)).rejects.toThrow(/\/meet/);
  });

  test("includes the server message for other errors", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(422, { error: "Unprocessable Entity", message: "Invalid request" }));
    const err = await meet.listRooms(SETTINGS, fetchMock).catch((e) => e);
    expect(err).toBeInstanceOf(meet.MeetApiError);
    expect(err.status).toBe(422);
    expect(err.message).toContain("Invalid request");
  });
});

describe("createRoom", () => {
  test("posts the room name", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, room()));
    const created = await meet.createRoom(SETTINGS, "Re: Daily", {}, fetchMock);

    expect(created.roomId).toBe("daily-abc");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SERVER + "/api/v1/rooms");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ roomName: "Daily" });
  });

  test("sets autoDeletionDate when asked", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, room()));
    const before = Date.now();
    await meet.createRoom(SETTINGS, "Daily", { autoDeletionDays: 30 }, fetchMock);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const expected = before + 30 * 24 * 3600 * 1000;
    expect(body.autoDeletionDate).toBeGreaterThanOrEqual(expected);
    expect(body.autoDeletionDate).toBeLessThan(expected + 60 * 1000);
  });

  test.each([0, -1, "abc", null])("no autoDeletionDate for %p days", async (days) => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, room()));
    await meet.createRoom(SETTINGS, "Daily", { autoDeletionDays: days }, fetchMock);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("autoDeletionDate");
  });
});

describe("invitationSnippet", () => {
  test("escapes HTML in names and URLs", () => {
    const s = meet.invitationSnippet("<b>Q&A</b>", SERVER + "/room/x?secret=1&a=\"2\"");
    expect(s.html).not.toContain("<b>");
    expect(s.html).toContain("&lt;b&gt;Q&amp;A&lt;/b&gt;");
    expect(s.html).toContain("secret=1&amp;a=&quot;2&quot;");
    expect(s.text).toContain(SERVER + "/room/x?secret=1&a=\"2\"");
  });
});
