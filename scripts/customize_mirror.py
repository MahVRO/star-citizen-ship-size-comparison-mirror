"""Apply the local UI layer after upstream assets have been mirrored."""
from pathlib import Path
import shutil
import hashlib
import json
import re


def customize(output: Path, prefix: str) -> None:
    assets = Path(__file__).resolve().parents[1] / 'ui'
    destination = output / 'viewer'
    destination.mkdir(parents=True, exist_ok=True)
    for name in ('mirror.css', 'mirror.js', 'catalogue-layout.js', 'mobile-layout.js'):
        shutil.copyfile(assets / name, destination / name)
    # The manufacturer gallery is a persistent catalogue section. Choosing a
    # manufacturer or searching ships must not collapse it.
    viewer = destination / 'viewer.js'
    source = viewer.read_text()
    source = source.replace("event.target.closest('.maker-picker')", "event.target.closest('.add-panel')")
    source = source.replace(
        "$('maker-options').hidden = true; $('maker-toggle').setAttribute('aria-expanded', 'false');",
        "$('maker-options').hidden = false; $('maker-toggle').setAttribute('aria-expanded', 'true');",
    )
    viewer.write_text(source)
    shutil.copytree(assets / 'brand-logos', destination / 'brand-logos', dirs_exist_ok=True)
    aliases = {
        'aegis_font': 'AEGS', 'anvil': 'ANVL', 'aopoa': 'XNAA', 'argo': 'ARGO',
        'banu': 'BANU', 'consolidated': 'CNOU', 'crusader': 'CRUS', 'drake': 'DRAK',
        'esperia': 'ESPR', 'gatac': 'GAMA', 'greys': 'GREY', 'greycat': 'GRIN',
        'kruger': 'KRIG', 'mirai_whitefont': 'MRAI', 'misc': 'MISC', 'origin': 'ORIG',
        'rsi': 'RSI', 'tumbril': 'TMBL', 'vandull': 'VNCL',
    }
    hover_logos = {}
    for file in sorted((assets / 'brand-logos' / 'hover').iterdir()):
        if file.suffix.lower() not in {'.svg', '.png', '.webp', '.jpg', '.jpeg'}:
            continue
        code = aliases.get(file.stem.lower(), file.stem.upper())
        if code in hover_logos:
            raise ValueError(f'Duplicate hover logo for {code}: use one file per manufacturer')
        version = hashlib.sha256(file.read_bytes()).hexdigest()[:12]
        hover_logos[code] = f'{file.name}?v={version}'
    manifest = json.dumps(hover_logos, sort_keys=True)
    (destination / 'brand-logos' / 'hover' / 'manifest.json').write_text(manifest)
    version = hashlib.sha256(manifest.encode() + (assets / 'brand-logos' / 'variants.json').read_bytes()).hexdigest()[:12]
    custom_js = destination / 'mirror.js'
    custom_js.write_text(custom_js.read_text().replace('__HOVER_LOGOS_VERSION__', version))
    shutil.copytree(assets / 'ships', destination / 'ships', dirs_exist_ok=True)
    ship_version = hashlib.sha256((assets / 'ships' / 'manifest.json').read_bytes()).hexdigest()[:12]
    custom_js.write_text(custom_js.read_text().replace('__SHIP_ART_VERSION__', ship_version))
    index = output / 'index.html'
    html = index.read_text()
    html = html.replace('content="width=device-width, initial-scale=1"',
                        'content="width=device-width, initial-scale=1, viewport-fit=cover"')
    viewer_version = hashlib.sha256(viewer.read_bytes()).hexdigest()[:12]
    html = re.sub(r'(src="[^" ]*viewer/viewer\.js)(?:\?[^" ]*)?"',
                  lambda match: match[1] + '?v=' + viewer_version + '"', html)
    # Content versions prevent cached Pages assets from hiding a UI update.
    for name, tag in (
        ('mirror.css', '<link rel="stylesheet" href="{url}">'),
        ('mirror.js', '<script src="{url}" defer></script>'),
        ('catalogue-layout.js', '<script src="{url}" defer></script>'),
        ('mobile-layout.js', '<script src="{url}" defer></script>'),
    ):
        version = hashlib.sha256((destination / name).read_bytes()).hexdigest()[:12]
        url = f'{prefix}viewer/{name}?v={version}'
        pattern = (r'<link[^>]*href="[^" ]*viewer/mirror\.css[^" ]*"[^>]*>'
                   if name.endswith('.css') else
                   rf'<script[^>]*src="[^" ]*viewer/{re.escape(name)}[^" ]*"[^>]*></script>')
        element = tag.format(url=url)
        if re.search(pattern, html):
            html = re.sub(pattern, lambda _: element, html)
        else:
            end = '</head>' if name.endswith('.css') else '</body>'
            html = html.replace(end, element + '\n' + end)
    index.write_text(html)
