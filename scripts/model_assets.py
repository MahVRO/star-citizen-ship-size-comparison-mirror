"""Download pinned model inputs, including external glTF resources, with caching."""
import hashlib
import base64
import json
import struct
import urllib.parse
import urllib.request
from pathlib import Path


def fetch(url, target):
    target = Path(target)
    if target.is_file():
        return target.read_bytes()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=180) as response:
                data = response.read()
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(target.suffix + '.tmp')
            temporary.write_bytes(data)
            temporary.replace(target)
            return data
        except Exception:
            if attempt == 2:
                raise


def document(data):
    if data[:4] == b'glTF':
        assert struct.unpack_from('<I', data, 4)[0] == 2
        length = struct.unpack_from('<I', data, 12)[0]
        return json.loads(data[20:20 + length])
    return json.loads(data)


def stats(data):
    gltf = document(data)
    triangles = vertices = 0
    for mesh in gltf.get('meshes', []):
        for primitive in mesh['primitives']:
            if primitive.get('mode', 4) != 4:
                continue
            count = gltf['accessors'][primitive['attributes']['POSITION']]['count']
            vertices += count
            triangles += (gltf['accessors'][primitive['indices']]['count']
                          if 'indices' in primitive else count) // 3
    return {'triangles': triangles, 'vertices': vertices,
            'meshes': len(gltf.get('meshes', [])), 'bytes': len(data)}


def download_model(url, cache):
    directory = Path(cache) / hashlib.sha256(url.encode()).hexdigest()[:20]
    data = fetch(url, directory / 'source')
    gltf = document(data)
    local = directory / ('model.glb' if data[:4] == b'glTF' else 'model.gltf')
    if data[:4] == b'glTF':
        local.write_bytes(data)
    else:
        # Rewrite every external URI to a local cached resource. The output GLB
        # embeds these buffers/images; the deployed viewer never calls this API.
        for entry in gltf.get('buffers', []) + gltf.get('images', []):
            uri = entry.get('uri', '')
            if uri and not uri.startswith('data:'):
                remote = urllib.parse.urljoin(url, uri)
                suffix = Path(urllib.parse.urlsplit(remote).path).suffix
                name = hashlib.sha256(remote.encode()).hexdigest()[:20] + suffix
                fetch(remote, directory / name)
                entry['uri'] = name
        local.write_text(json.dumps(gltf))
    return local, data


def pack_model(source, target, rotation):
    """Repack an already-compressed source without decoding or changing meshes."""
    source = Path(source)
    raw = source.read_bytes()
    gltf = document(raw)
    binary = bytearray()
    offsets = []
    original_bin = b''
    if raw[:4] == b'glTF':
        json_size = struct.unpack_from('<I', raw, 12)[0]
        bin_size = struct.unpack_from('<I', raw, 20 + json_size)[0]
        original_bin = raw[28 + json_size:28 + json_size + bin_size]
    for buffer in gltf.get('buffers', []):
        uri = buffer.get('uri')
        data = (base64.b64decode(uri.split(',', 1)[1]) if uri and uri.startswith('data:')
                else (source.parent / uri).read_bytes() if uri else original_bin)
        binary.extend(b'\0' * (-len(binary) % 4))
        offsets.append(len(binary))
        binary.extend(data[:buffer['byteLength']])
    for view in gltf.get('bufferViews', []):
        view['byteOffset'] = view.get('byteOffset', 0) + offsets[view['buffer']]
        view['buffer'] = 0
    if any(image.get('uri') for image in gltf.get('images', [])):
        raise ValueError('Packing fallback needs embedded image bufferViews')
    gltf['buffers'] = [{'byteLength': len(binary)}]
    for scene in gltf.get('scenes', []):
        index = len(gltf['nodes'])
        gltf['nodes'].append({'name': 'Canonical hangar orientation',
                              'rotation': rotation, 'children': scene.get('nodes', [])})
        scene['nodes'] = [index]
    encoded = json.dumps(gltf, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    result = (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
              + struct.pack('<I4s', len(encoded), b'JSON') + encoded
              + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    Path(target).write_bytes(result)
