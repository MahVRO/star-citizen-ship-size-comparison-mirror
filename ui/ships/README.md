# Ship artwork

Bundled thumbnails are sourced from RSI's official ship-matrix API. `manifest.json` maps exact catalogue IDs to thumbnail files, original URLs and catalogue model lengths. Only exact source-path matches or unique name/manufacturer matches are used. Unmatched ships have a neutral fallback, with no guessed artwork.

Regenerate from the repository root using `MIRROR_OUTPUT=/path/to/built/mirror python3 scripts/update_ship_art.py`. The normal mirror build copies these assets without requiring RSI network access at runtime. Images and ship trademarks belong to Cloud Imperium Games / their respective owners.
