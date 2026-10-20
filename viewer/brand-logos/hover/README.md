# Manufacturer hover logos

Drop transparent SVG, PNG or WebP files here (JPG/JPEG also supported).
Name each file using the exact manufacturer code, for example `AEGS.svg` or `ANVL.png`.
Use one file per manufacturer. Keep logos tightly cropped with minimal empty space; a square canvas and at least 256px is recommended for raster files.

AEGS — Aegis Dynamics
ANVL — Anvil Aerospace
XNAA — Aopoa
ARGO — Argo Astronautics
BANU — Banu
CNOU — Consolidated Outland
CRUS — Crusader Industries
DRAK — Drake Interplanetary
ESPR — Esperia
GAMA — Gatac Manufacture
GREY — Grey's Market
GRIN — Greycat Industrial
KRIG — Kruger Intergalactic
MRAI — Mirai
MISC — MISC
ORIG — Origin Jumpworks
RSI — Roberts Space Industries
TMBL — Tumbril
VNCL — Vanduul

The build discovers these files automatically, copies them into the published site and versions their URLs. They replace the normal tile logo on hover and keyboard focus. Missing or failed variants fall back to the existing logo. Rebuild and publish after adding files; do not put them in generated public/ or viewer/ folders.

The uploaded descriptive filenames (`aegis_font.png`, `anvil.png`, `aopoa.png`, `argo.png`, `banu.png`, `consolidated.png`, `crusader.webp`, `drake.png`, `esperia.webp`, `gatac.webp`, `greys.webp`, `greycat.png`, `kruger.png`, `mirai_whitefont.png`, `misc.png`, `origin.png`, `rsi.png`, `tumbril.png`, `vandull.webp`) are also mapped automatically. Keep their stems when replacing them; changing image format is fine. Do not add a second file for the same manufacturer.
