"""Apply reviewed, pinned higher-detail meshes to a freshly mirrored catalogue."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess

from model_assets import download_model, stats, pack_model, fetch

ROOT = Path(__file__).resolve().parents[1]


def upgrade_models(output: Path, prefix: str) -> None:
    manifest = json.loads((ROOT / 'models' / 'upgrades.json').read_text())
    cache = Path(os.environ.get('MODEL_CACHE', '/tmp/fleet-model-cache'))

    def prepare(entry):
        source, raw = download_model(entry['source'], cache)
        if hashlib.sha256(raw).hexdigest() != entry['sourceSha256']:
            raise ValueError(f"Source changed; review model before updating: {entry['id']}")
        converted = source.parent / 'upgraded.glb'
        if not converted.is_file() or hashlib.sha256(converted.read_bytes()).hexdigest() != entry['outputSha256']:
            if entry.get('packing') == 'original':
                pack_model(source, converted, entry['rotation'])
            else:
                subprocess.run(['node', str(ROOT / 'scripts' / 'convert_model.mjs'),
                                'convert', str(source), str(converted), json.dumps(entry['rotation'])],
                               cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
        data = converted.read_bytes()
        if hashlib.sha256(data).hexdigest() != entry['outputSha256']:
            raise ValueError(f"Converted model differs from reviewed output: {entry['id']}")
        measured = stats(data)
        assert measured['triangles'] == entry['triangles'], entry['id']
        assert measured['triangles'] > entry['previousTriangles'], entry['id']
        assert len(data) < 99 * 1024**2, entry['id']
        relative = f"Assets/HighDetail/{entry['outputSha256'][:20]}.glb"
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(converted, target)
        return entry['id'], relative

    # Large ships can consume substantial RAM during decoding/conversion.
    with ThreadPoolExecutor(max_workers=2) as pool:
        paths = dict(pool.map(prepare, manifest['upgrades']))
    entries = {entry['id']: entry for entry in manifest['upgrades']}
    catalogue = output / 'viewer' / 'catalog.json'
    catalog = json.loads(catalogue.read_text())
    for maker in catalog['manufacturers']:
        for ship in maker['ships']:
            if ship['id'] not in paths:
                continue
            entry = entries[ship['id']]
            old_path = ship['path']
            ship.update(path=paths[ship['id']], modelSource=entry['source'],
                        modelProvider='FleetYards', modelTriangles=entry['triangles'])
            legacy = next((item for item in manifest.get('legacy', [])
                           if item.get('id') == ship['id']), None)
            if legacy:
                ship['fallbackPath'] = legacy['path']
            # The replacement already contains its reviewed orientation wrapper.
            # Existing catalogue rotation, length calibration and stable IDs stay.
            if old_path != ship['path']:
                (output / old_path).unlink(missing_ok=True)
    catalog['modelSources'] = 'models.json'
    catalogue.write_text(json.dumps(catalog, indent=2) + '\n')
    (output / 'viewer' / 'models.json').write_text(json.dumps(manifest, indent=2) + '\n')
    # Preserve compatibility for existing tabs that predate the Draco rollout.
    # The new catalogue still selects the high-detail asset, never this fallback.
    for legacy in manifest.get('legacy', []):
        data = ((ROOT / legacy['bundled']).read_bytes() if legacy.get('bundled')
                else fetch(legacy['source'], cache / 'legacy' / legacy['sha256']))
        if hashlib.sha256(data).hexdigest() != legacy['sha256']:
            raise ValueError(f"Legacy source changed: {legacy['path']}")
        target = output / legacy['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    # Pin the decoder to the same Three.js release as the mirrored viewer.
    examples = ROOT / 'node_modules' / 'three' / 'examples'
    vendor = output / 'viewer' / 'vendor' / 'examples'
    files = ['jsm/loaders/DRACOLoader.js'] + [f'jsm/libs/draco/gltf/{name}' for name in
             ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js']]
    for relative in files:
        target = vendor / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(examples / relative, target)
    viewer = output / 'viewer' / 'viewer.js'
    source = viewer.read_text()
    helper = ROOT / 'ui' / 'model-loading.js'
    shutil.copyfile(helper, output / 'viewer' / helper.name)
    version = hashlib.sha256(helper.read_bytes()).hexdigest()[:12]
    source = re.sub(r"import \{ loadModel \} from [^\n]+\n", '', source)
    source = f"import {{ loadModel }} from './model-loading.js?v={version}';\n" + source
    source = re.sub(r'  const gltf = await (?:loader\.loadAsync|loadModel)\([^\n]+;',
                    '  const gltf = await loadModel(loader, ship, '
                    + json.dumps(prefix + 'viewer/catalog.json') + ', ' + json.dumps(prefix) + ');', source, count=1)
    source = source.replace('  const model = gltf.scene;',
                            "  if (ship.modelLoadWarning) notify(ship.modelLoadWarning);\n  const model = gltf.scene;")
    # Keep repeated local builds from duplicating the notification hook.
    source = source.replace("  if (ship.modelLoadWarning) notify(ship.modelLoadWarning);\n" * 2,
                            "  if (ship.modelLoadWarning) notify(ship.modelLoadWarning);\n")
    if "import { DRACOLoader }" not in source:
        source = "import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';\n" + source
    replacement = ("const dracoLoader = new DRACOLoader().setWorkerLimit(2).setDecoderPath("
                   + json.dumps(prefix + 'viewer/vendor/examples/jsm/libs/draco/gltf/') + ");\n"
                   "const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(dracoLoader);")
    source = source.replace('const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);', replacement)
    viewer.write_text(source)
    print(f"Upgraded {len(paths)} ship models; retained {len(manifest['retained'])} originals", flush=True)


if __name__ == '__main__':
    upgrade_models(Path(os.environ.get('MIRROR_OUTPUT', 'public')),
                   '/' + os.environ.get('GITHUB_REPOSITORY', 'MahVRO/star-citizen-ship-size-comparison-mirror').split('/')[-1] + '/')
