import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { exportBundleNodeSvg } from '../src/export.js';

test('writes only the selected bundle node as SVG', async () => {
  const bundle = await mkdtemp(join(tmpdir(), 'figctx-cli-export-'));
  await mkdir(join(bundle, 'assets/vectors'), { recursive: true });
  await writeFile(join(bundle, 'document.agent.json'), JSON.stringify(document));
  await writeFile(join(bundle, 'assets/vectors/vector-network-7.bin.gz'), gzipSync(triangleBytes()));
  const output = join(bundle, 'out/hero.svg');

  const result = await exportBundleNodeSvg(bundle, '1-1', output);

  expect(result).toEqual({ nodeId: '1:1', out: output });
  await expect(readFile(output, 'utf8')).resolves.toContain('<svg');
});

const document = {
  contractVersion: '1',
  rootIds: ['1:1'],
  nodesById: {
    '1:1': { id: '1:1', name: 'Hero', type: 'FRAME', childIds: ['1:2'], zIndex: 0, bounds: { x: 10, y: 10 }, assetRefs: [] },
    '1:2': { id: '1:2', name: 'Triangle', type: 'VECTOR', parentId: '1:1', childIds: [], zIndex: 1, assetRefs: [], vectorRef: { blobId: 7, path: 'assets/vectors/vector-network-7.bin.gz', format: 'kiwi-vector-network', compression: 'gzip' } }
  }
};

function triangleBytes(): Uint8Array {
  const bytes = new Uint8Array(12 + 3 * 12 + 3 * 28 + 8 + 4 + 3 * 4);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const uint = (value: number) => { view.setUint32(offset, value, true); offset += 4; };
  const float = (value: number) => { view.setFloat32(offset, value, true); offset += 4; };
  uint(3); uint(3); uint(1);
  for (const [x, y] of [[0, 0], [10, 0], [0, 10]]) { uint(0); float(x); float(y); }
  for (const [start, end] of [[0, 1], [1, 2], [2, 0]]) { uint(0); uint(start); float(0); float(0); uint(end); float(0); float(0); }
  uint(0); uint(1); uint(3); uint(0); uint(1); uint(2);
  return bytes;
}
