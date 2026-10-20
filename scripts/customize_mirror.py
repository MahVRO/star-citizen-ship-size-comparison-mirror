"""Apply the local UI layer after upstream assets have been mirrored."""
from pathlib import Path
import shutil


def customize(output: Path, prefix: str) -> None:
    assets = Path(__file__).resolve().parents[1] / 'ui'
    destination = output / 'viewer'
    destination.mkdir(parents=True, exist_ok=True)
    for name in ('mirror.css', 'mirror.js'):
        shutil.copyfile(assets / name, destination / name)
    index = output / 'index.html'
    html = index.read_text()
    if 'viewer/mirror.css' not in html:
        html = html.replace('</head>', f'<link rel="stylesheet" href="{prefix}viewer/mirror.css">\n</head>')
    if 'viewer/mirror.js' not in html:
        html = html.replace('</body>', f'<script src="{prefix}viewer/mirror.js" defer></script></body>')
    index.write_text(html)
