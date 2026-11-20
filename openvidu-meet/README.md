# OpenVidu Meet for Thunderbird

A Thunderbird add-on for [OpenVidu Meet](https://openvidu.io/latest/meet/):
create meeting rooms, put their links in your messages and join meetings
without leaving Thunderbird.

## Features

- **Meet link button in the compose window.** It creates a room named after the
  message subject and inserts its guest link at the cursor. It can also insert
  the link of an existing room. Rooms created this way are deleted
  automatically after 30 days by default (configurable).
- **OpenVidu Meet space** in the left toolbar. It lists your rooms, with meetings
  in progress first. Click a room to join it as host in a Thunderbird tab, use
  **⧉** to copy its guest link, and **+** to create a room.
- **Open in browser.** If camera or microphone access does not work inside
  Thunderbird, open the meeting in your default browser from the tab toolbar.

Guests get the room's anonymous **speaker** link; you join with the
**moderator** link. Both come from the room's `access.anonymous` links in the
OpenVidu Meet REST API.

## Requirements

- Thunderbird 128 or later.
- An OpenVidu Meet deployment (tested against the 3.9 REST API) and an API key:
  in OpenVidu Meet, go to **Embedded → Generate API Key**.

> **Security:** the API key gives full control over every room on the server.
> It is stored in Thunderbird's local extension storage and sent only to your
> server. Use the add-on only on computers you trust.

## Setup

1. Install the `.xpi` from the
   [releases page](https://github.com/gortazar/thunderbird-extensions/releases)
   (*Tools → Add-ons and Themes → ⚙ → Install Add-on From File…*).
2. In the settings page that opens, enter:
   - **Server URL**, including the Meet base path, e.g.
     `https://openvidu.example.com/meet`.
   - **API key**.
   - Optionally, your display name and how many days rooms created from
     messages are kept.
3. Click **Save settings** and allow Thunderbird to access your server when it
   asks. The add-on only gets access to that one server.

## Development

```sh
npm install
npm test          # unit tests (Jest)
./build.sh        # creates dist/openvidu-meet-<version>.xpi
```

To try changes without packaging: *Tools → Add-ons and Themes → ⚙ → Debug
Add-ons → Load Temporary Add-on…* and pick `src/manifest.json`.

| Path | Contents |
|------|----------|
| `src/lib/meet.js` | REST API client and helpers (shared, unit tested) |
| `src/lib/settings.js` | Settings and host permission helpers |
| `src/compose/` | Compose window popup |
| `src/sidebar/` | OpenVidu Meet space |
| `src/room/` | Tab that embeds a meeting |
| `src/options/` | Settings page |

This add-on was previously published as
[thunderbird-openvidu-meet-provisioner](https://github.com/gortazar/thunderbird-openvidu-meet-provisioner)
(v1.0.x). It keeps the same add-on ID, so existing installations update in
place. After updating, add `/meet` to the server URL if your server uses the
default base path.

## License

[Apache-2.0](LICENSE)
