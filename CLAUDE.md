# Thunderbird extensions

- One add-on per top-level folder (`<extension>/src/manifest.json`, `<extension>/build.sh`).
- Every change to an extension is a new **minor** release (bump `version` in its
  `manifest.json`) unless the user says otherwise. Pushing to `main` makes the
  `Build and release` workflow publish `<extension>-v<version>` with the `.xpi`.
- Changes that don't touch an extension (CI, top-level docs) need no bump.
