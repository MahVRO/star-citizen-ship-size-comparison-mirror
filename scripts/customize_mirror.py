"""Apply the local UI layer after upstream assets have been mirrored."""
from pathlib import Path
import shutil
import hashlib
import re


def customize(output: Path, prefix: str) -> None:
    assets = Path(__file__).resolve().parents[1] / 'ui'
    destination = output / 'viewer'
    destination.mkdir(parents=True, exist_ok=True)
    for name in ('mirror.css', 'mirror.js'):
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
    index = output / 'index.html'
    html = index.read_text()
    viewer_version = hashlib.sha256(viewer.read_bytes()).hexdigest()[:12]
    html = re.sub(r'(src="[^" ]*viewer/viewer\.js)(?:\?[^" ]*)?"',
                  lambda match: match[1] + '?v=' + viewer_version + '"', html)
    # Content versions prevent cached Pages assets from hiding a UI update.
    for name, tag in (
        ('mirror.css', '<link rel="stylesheet" href="{url}">'),
        ('mirror.js', '<script src="{url}" defer></script>'),
    ):
        version = hashlib.sha256((assets / name).read_bytes()).hexdigest()[:12]
        url = f'{prefix}viewer/{name}?v={version}'
        pattern = (r'<link[^>]*href="[^" ]*viewer/mirror\.css[^" ]*"[^>]*>'
                   if name.endswith('.css') else
                   r'<script[^>]*src="[^" ]*viewer/mirror\.js[^" ]*"[^>]*></script>')
        element = tag.format(url=url)
        if re.search(pattern, html):
            html = re.sub(pattern, lambda _: element, html)
        else:
            end = '</head>' if name.endswith('.css') else '</body>'
            html = html.replace(end, element + '\n' + end)
    index.write_text(html)
