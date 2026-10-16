"""Build a self-contained static snapshot of Fleet Viewer for GitHub Pages."""
from concurrent.futures import ThreadPoolExecutor
import json, os, re, struct, urllib.parse, urllib.request
from pathlib import Path
ORIGIN = 'https://fleet-viewer.com/'
OUT = Path(os.environ.get('MIRROR_OUTPUT', 'public'))
PREFIX = '/' + os.environ.get('GITHUB_REPOSITORY', 'MahVRO/star-citizen-ship-size-comparison-mirror').split('/')[-1] + '/'
seen = set()
catalog = None

def download(path):
    path = urllib.parse.unquote(urllib.parse.urlsplit(path).path).lstrip('/')
    if not path or path.endswith('/'): path += 'index.html'
    if '..' in Path(path).parts: raise ValueError(path)
    remote = path[:-10] if path.endswith('index.html') else path
    for attempt in range(3):
        try:
            with urllib.request.urlopen(ORIGIN + urllib.parse.quote(remote, safe='/'), timeout=90) as response:
                data = response.read()
            break
        except Exception:
            if attempt == 2: raise
    file = OUT / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(data)
    return path

def discover(path):
    file = OUT / path
    found = set()
    if path.endswith(('.html', '.css')):
        text = file.read_text()
        for match in re.findall(r"""(?:src|href)=["']([^"']+)|url\(["']?([^)'"\s]+)""", text):
            value = next((x for x in match if x), '')
            u = urllib.parse.urlsplit(urllib.parse.urljoin(ORIGIN + path, value))
            if u.netloc == 'fleet-viewer.com' and not u.fragment:
                p = u.path.lstrip('/')
                if not p or p.endswith('/'): p += 'index.html'
                found.add(p)
        found.update(re.findall(r'"(/viewer/[^" ]+\.js)"', text))
    if path.endswith('.js'):
        text = file.read_text()
        for spec in re.findall(r"""(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]""", text):
            if spec.startswith('.'):
                found.add(urllib.parse.urlsplit(urllib.parse.urljoin(ORIGIN + path, spec)).path.lstrip('/'))
    if path.endswith('.glb'):
        data = file.read_bytes()
        assert data[:4] == b'glTF', path
        size, kind = struct.unpack_from('<II', data, 12)
        gltf = json.loads(data[20:20+size])
        for entry in gltf.get('buffers', []) + gltf.get('images', []):
            uri = entry.get('uri', '')
            if uri and not uri.startswith('data:'):
                found.add(urllib.parse.urlsplit(urllib.parse.urljoin(ORIGIN + path, uri)).path.lstrip('/'))
    return found

pending = {'index.html', 'about/index.html', 'starter-ships/index.html', 'referral-code/index.html', 'favicon.svg',
 'viewer/viewer.js', 'viewer/viewer.css', 'viewer/navigation.js', 'viewer/fleet-import.js', 'viewer/catalog.json',
 'viewer/vendor/build/three.module.js', 'viewer/vendor/build/three.core.js',
 'viewer/vendor/examples/jsm/controls/OrbitControls.js', 'viewer/vendor/examples/jsm/controls/TransformControls.js',
 'viewer/vendor/examples/jsm/loaders/GLTFLoader.js', 'viewer/vendor/examples/jsm/libs/meshopt_decoder.module.js'}
with ThreadPoolExecutor(max_workers=8) as pool:
    while pending:
        batch = sorted(pending - seen)
        if not batch: break
        completed = list(pool.map(download, batch))
        seen.update(completed)
        pending = set()
        for path in completed: pending.update(discover(path))
        if 'viewer/catalog.json' in completed:
            catalog = json.loads((OUT / 'viewer/catalog.json').read_text())
            for maker in catalog['manufacturers']:
                if maker.get('logo'): pending.add(maker['logo'])
                pending.update(ship['path'] for ship in maker['ships'])
        pending = {p.lstrip('/') for p in pending} - seen
        print(f'Downloaded {len(seen)} files; {len(pending)} remaining', flush=True)

for file in OUT.rglob('*'):
    if file.suffix not in ('.html', '.js', '.css'): continue
    text = file.read_text()
    text = re.sub(r"""(["'])/(?!/)""", lambda m: m[1] + PREFIX, text)
    text = text.replace('url(/', 'url(' + PREFIX)
    if file.suffix == '.html':
        text = re.sub(r'<meta name="robots"[^>]*>', '<meta name="robots" content="noindex, nofollow">', text)
    file.write_text(text)
(OUT / '.nojekyll').touch()
(OUT / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
ships = [s for m in catalog['manufacturers'] for s in m['ships']]
assert all((OUT / s['path']).is_file() for s in ships)
assert (OUT / 'viewer/vendor/build/three.core.js').is_file()
print(f'Complete: {len(ships)} ships, {len(seen)} files, {sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file()) / 1048576:.1f} MiB')
