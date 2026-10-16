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
