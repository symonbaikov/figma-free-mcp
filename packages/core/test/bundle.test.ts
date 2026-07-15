import { mkdtemp, readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { writeBundle } from '../src/bundle/write-bundle.js';

test('writes an atomic inspectable bundle', async () => {
  const outDir = join(await mkdtemp(join(tmpdir(), 'figctx-bundle-')), 'design');
  const tokens = { colors: [], typography: [], effects: [], fonts: [] };
  const agent = {
    contractVersion: '1' as const,
    rootIds: ['6:1'],
    nodesById: {
      '6:1': {
        id: '6:1',
        name: 'Hero',
        type: 'FRAME',
        childIds: [],
        zIndex: 0,
        assetRefs: [{ hash: 'a', path: 'assets/images/a.jpg', kind: 'image-fill' as const }],
        readyAssetRefs: [{
          id: 'rendered-vector-subtree-6_1',
          sourceNodeId: '6:1',
          path: 'assets/ready/rendered-vector-subtree-6_1.png',
          kind: 'rendered-vector-subtree' as const,
          format: 'png' as const,
          width: 253,
          height: 240,
          scale: 2,
          sha256: '22'.repeat(32)
        }]
      }
    }
  };
  await writeBundle({
    outDir,
    manifest: { contractVersion: '1', status: 'success' },
    raw: { source: 'test' },
    agent,
    images: [{ hash: 'a', bytes: Uint8Array.from([0xff, 0xd8, 0xff]), format: 'jpeg' }],
    vectors: [{ blobId: 7, bytes: Uint8Array.from([5, 6]) }],
    readyAssets: [{
      id: 'rendered-vector-subtree-6_1',
      sourceNodeId: '6:1',
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      format: 'png',
      width: 253,
      height: 240,
      scale: 2,
      sha256: '22'.repeat(32)
    }],
    thumbnail: Uint8Array.from([1, 2, 3]),
    tokens
  });
  expect(JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'))).toMatchObject({ status: 'success' });
  await expect(readFile(join(outDir, 'assets/images/a.jpg'))).resolves.toBeTruthy();
  expect(JSON.parse(await readFile(join(outDir, 'assets/images.json'), 'utf8'))).toMatchObject({ images: [{ hash: 'a', path: 'assets/images/a.jpg', format: 'jpeg' }] });
  await expect(readFile(join(outDir, 'assets/thumbnail.png'))).resolves.toEqual(Buffer.from([1, 2, 3]));
  expect(JSON.parse(await readFile(join(outDir, 'assets/vectors.json'), 'utf8'))).toMatchObject({ vectors: [{ blobId: 7, path: 'assets/vectors/vector-network-7.bin.gz', compression: 'gzip' }] });
  expect(gunzipSync(await readFile(join(outDir, 'assets/vectors/vector-network-7.bin.gz')))).toEqual(Buffer.from([5, 6]));
  await expect(readFile(join(outDir, 'assets/ready/rendered-vector-subtree-6_1.png'))).resolves.toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  expect(JSON.parse(await readFile(join(outDir, 'assets/ready.json'), 'utf8'))).toMatchObject({
    contractVersion: '1',
    readyAssets: [{
      id: 'rendered-vector-subtree-6_1',
      sourceNodeId: '6:1',
      path: 'assets/ready/rendered-vector-subtree-6_1.png',
      format: 'png',
      width: 253,
      height: 240,
      scale: 2,
      sha256: '22'.repeat(32)
    }]
  });
  await expect(readFile(join(outDir, 'frames/6_1/context.md'), 'utf8')).resolves.toContain('- asset: `assets/images/a.jpg` (a)\n- ready asset: `assets/ready/rendered-vector-subtree-6_1.png` (6:1)');
  await expect(writeBundle({ outDir, manifest: {}, raw: {}, agent: { contractVersion: '1', rootIds: [], nodesById: {} }, images: [], vectors: [], readyAssets: [], tokens })).rejects.toMatchObject({ code: 'OUTPUT_EXISTS' });
});
