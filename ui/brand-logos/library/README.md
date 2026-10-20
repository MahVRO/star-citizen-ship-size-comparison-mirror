# Curated manufacturer logo library

`../variants.json` maps catalogue codes to `mono`, `color` (original-color or original-finish artwork) and `wordmark` variants with source URLs. Null means an unresolved source gap.

Current collection:
- 19 monochrome logos, sourced from SharedIcons and Star Citizen Wiki.
- 18 original-color/finish variants, including official metallic or grayscale artwork from RSI's ship-matrix API, the green Aopoa mark, and Mirai's red emblem with its name.
- 17 wordmarks, including Mirai, MISC, Esperia and Gatac.

Remaining source gaps: Argo color variant; Banu and Vanduul name-bearing wordmarks. Older Argo circle artwork is not substituted for the current mark.

Grid logos are monochrome by default; hover and selection use available original-finish artwork. Selected manufacturer headers can use name-bearing wordmarks. `../preview.html` compares every variant and links to its source.

SVG wordmarks with large empty canvases are trimmed to artwork bounds. Default black lettering on Mirai/MISC and dark Gatac lettering is made light for dark UI; the original red, blue and green emblem colors are preserved. Those adaptations and unmodified source files are recorded in variants.json. Artwork and trademarks belong to Cloud Imperium Games / their respective owners.

Old uploads under `../hover/` are retained but are no longer selected by the UI. Extend this library and variants.json to add verified artwork. Content hashes prevent stale asset caches.
