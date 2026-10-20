"""Refresh bundled ship thumbnails from RSI, matching only exact paths or unique names.

Run from the repo root after building a mirror:
MIRROR_OUTPUT=/workspace/fleet-viewer-runtime/star-citizen-ship-size-comparison-mirror python3 scripts/update_ship_art.py
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit, unquote
from urllib.request import Request, urlopen
import hashlib
import json
import os
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'ui' / 'ships'
OUT.mkdir(exist_ok=True)
ENDPOINT = 'https://robertsspaceindustries.com/ship-matrix/index'


def read(url):
    with urlopen(Request(url, headers={'User-Agent': 'FleetMirror/1.0'}), timeout=45) as response:
        return response.read()


def path(url):
    return unquote(urlsplit(url).path).lower().replace('/en/', '/').rstrip('/')


def normalized(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())


if __name__ == '__main__':
    catalogue = Path(os.environ.get('MIRROR_OUTPUT', 'public')) / 'viewer' / 'catalog.json'
    ships = json.loads(catalogue.read_text())['manufacturers']
    records = json.loads(read(ENDPOINT))['data']
    by_path = {path(ship['url']): ship for ship in records}
    by_name = {}
    for record in records:
        key = (record['manufacturer']['code'], normalized(record['name']))
        by_name.setdefault(key, []).append(record)

    def artwork(item):
        maker, ship = item
        entry = {'length': ship.get('length')}
        record = by_path.get(path(ship.get('source', '')))
        if record and record['manufacturer']['code'] != maker['code']:
            record = None
        if not record:
            hits = by_name.get((maker['code'], normalized(ship['name'])), [])
            record = hits[0] if len(hits) == 1 else None
        media = next((m for m in (record or {}).get('media', []) if m.get('membership.slot') == 'thumbnail'), None)
        if media:
            url = media.get('images', {}).get('store_small') or media.get('source_url')
            if url:
                if url.startswith('/'):
                    url = 'https://robertsspaceindustries.com' + url
                try:
                    data = read(url)
                    # Refuse HTML/error bodies masquerading as images.
                    if not (data.startswith(b'\xff\xd8') or data.startswith(b'\x89PNG') or data.startswith(b'RIFF')):
                        raise ValueError('Unsupported image response')
                    suffix = '.png' if data.startswith(b'\x89PNG') else '.webp' if data.startswith(b'RIFF') else '.jpg'
                    file = hashlib.sha256(data).hexdigest()[:16] + suffix
                    (OUT / file).write_bytes(data)
                    entry.update(image=file, source=url, name=record['name'])
                except Exception as error:
                    print(f'No thumbnail for {ship["name"]}: {type(error).__name__}')
        return ship['id'], entry

    items = [(maker, ship) for maker in ships for ship in maker['ships']]
    with ThreadPoolExecutor(max_workers=6) as pool:
        result = dict(pool.map(artwork, items))
    (OUT / 'manifest.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'{sum("image" in s for s in result.values())}/{len(result)} ship thumbnails matched; all catalogue lengths retained.')
