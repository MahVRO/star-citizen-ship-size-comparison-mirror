# Fleet Viewer — personal mirror

Static mirror of https://fleet-viewer.com/ with its original layout, controls, catalogue, logos and ship models. Runtime assets are hosted together, so opening the viewer does not require access to the original domain.

## Enable the website

1. Wait for **Actions → Build Fleet Viewer mirror** to finish.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**, branch **gh-pages**, folder **/ (root)**, then **Save**.
4. Open https://mahvro.github.io/star-citizen-ship-size-comparison-mirror/

The Actions workflow downloads the public site and all catalogue models, adapts root paths for this repository, validates the model files and publishes the static output to the gh-pages branch. To refresh the snapshot, run the workflow manually from the Actions tab. There is no scheduled refresh.

## Attribution

Original Fleet Viewer design and application: https://fleet-viewer.com/.
Star Citizen, ship models and trademarks belong to Cloud Imperium Games / their respective owners. Original branding, referral links and credits are retained. This repository does not claim ownership of those works.

GitHub Pages is public. Robots directives request that crawlers not index this mirror; they do not restrict access.

## Local development and UI customizations

Requires Python 3.12+, with HTTPS access to `fleet-viewer.com`. No Python packages are required.

```sh
MIRROR_OUTPUT=/workspace/fleet-viewer-runtime/star-citizen-ship-size-comparison-mirror python3 scripts/build_mirror.py
python3 -m http.server 8000 --directory /workspace/fleet-viewer-runtime
```

Open the server at the `/star-citizen-ship-size-comparison-mirror/` path. The path prefix must match `GITHUB_REPOSITORY` (defaults to this repository).

The mirror downloads upstream files, rewrites their paths, then applies our local viewer UI using `scripts/customize_mirror.py`. Edit `ui/mirror.css` and `ui/mirror.js`, rather than downloaded files: these customizations are automatically included by the existing Pages build. The upstream Three.js viewer, catalogue, imports, controls and attribution are retained. Resources and referral content are available in the expandable community section.

For quick UI iteration against an already built snapshot, without redownloading models:

```sh
PYTHONPATH=scripts python3 -c "from pathlib import Path; from customize_mirror import customize; customize(Path('/workspace/fleet-viewer-runtime/star-citizen-ship-size-comparison-mirror'), '/star-citizen-ship-size-comparison-mirror/')"
```

Check desktop and mobile layouts, catalogue search and manufacturer selection, loading/removing a model, camera controls and JSON/CSV imports before publishing. `/` focuses search; Escape clears it. Browser sessions retain the upstream hangar state. No deployment is performed by these local commands.

## Publication troubleshooting

Pages must serve the generated site from **gh-pages / (root)**, not the source branch `main`. The generated branch contains `index.html`, the models and `.nojekyll`.

If Actions reports “The job was not started because your account is locked due to a billing issue”, no build steps ran: resolve the account billing restriction in GitHub settings. Changing the Python build cannot fix that restriction. A locally generated snapshot can still be pushed to `gh-pages`; Pages may also refuse deployment until GitHub removes the account restriction.
