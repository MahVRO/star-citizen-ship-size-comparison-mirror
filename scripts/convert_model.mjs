// Decode source Draco/GLB assets once at build time. The viewer continues using
// local decoders; no network decoder or runtime API needed.
import fs from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, draco as compressDraco, getBounds } from '@gltf-transform/functions';
import draco from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco.createDecoderModule(),
  'draco3d.encoder': await draco.createEncoderModule(),
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const [mode, input, output, rotation = '[0,0,0,1]'] = process.argv.slice(2);
const doc = await io.read(input);
if (mode === 'sample') {
  const points = [];
  const scene = doc.getRoot().listScenes()[0];
  const bounds = getBounds(scene);
  scene.traverse(node => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const m = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const a = primitive.getAttribute('POSITION');
      const step = Math.max(1, Math.ceil(a.getCount() / 12000));
      for (let i = 0; i < a.getCount(); i += step) {
        const [x,y,z] = a.getElement(i, []);
        points.push(m[0]*x+m[4]*y+m[8]*z+m[12],
                    m[1]*x+m[5]*y+m[9]*z+m[13],
                    m[2]*x+m[6]*y+m[10]*z+m[14]);
      }
    }
  });
  await fs.writeFile(output, Buffer.from(new Float32Array(points).buffer));
  await fs.writeFile(output + '.json', JSON.stringify(bounds));
} else if (mode === 'convert') {
  for (const scene of doc.getRoot().listScenes()) {
    const wrapper = doc.createNode('Canonical hangar orientation').setRotation(JSON.parse(rotation));
    for (const child of scene.listChildren()) wrapper.addChild(child);
    scene.addChild(wrapper);
  }
  // Exact welding shares identical vertices; dedup shares repeated meshes.
  // Degenerate faces may disappear, but no surface simplification is applied.
  // Do not run simplify(), which would undo the requested geometry upgrade.
  doc.getRoot().listExtensionsUsed().find(e => e.extensionName === 'KHR_draco_mesh_compression')?.dispose();
  await doc.transform(dedup(), weld(), compressDraco({encodeSpeed: 0,
    decodeSpeed: 5, quantizePosition: 16, quantizeNormal: 12}));
  await io.write(output, doc);
} else {
  throw new Error('Expected sample or convert mode');
}
