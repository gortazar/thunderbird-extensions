# Thunderbird extensions

Thunderbird add-ons, one per folder.

| Extension | Description |
|-----------|-------------|
| [sent-in-threads](sent-in-threads/) | Shows your sent replies inside the conversation threads of the Inbox (or wherever the conversation lives). |

## Layout

Each extension folder contains:

- `src/` – the add-on source (`manifest.json` lives here)
- `build.sh` – packs `src/` into `dist/<id>-<version>.xpi`
- `README.md` – what it does and how to use it

## Releases

Pushing to `main` runs [`.github/workflows/release.yml`](.github/workflows/release.yml).
For each extension whose `src/manifest.json` version has no release yet, it
builds the `.xpi` and publishes a GitHub release tagged `<extension>-v<version>`
with the `.xpi` attached. Pull requests only build the packages.

To release a new version, bump `version` in the extension's `manifest.json`.
Every change is a new minor release unless stated otherwise.

Download the `.xpi` from the [releases page](https://github.com/gortazar/thunderbird-extensions/releases),
then in Thunderbird: *Tools → Add-ons and Themes → ⚙ → Install Add-on From File…*.

## License

MIT
