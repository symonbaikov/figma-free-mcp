import { describe, expect, test } from 'vitest';
import { normalizeDocument } from '../src/normalize/document.js';
import { renderReadyAssets } from '../src/render/render-ready-assets.js';
import { findReadyAssetTargets } from '../src/render/targets.js';

describe('ready vector asset rendering', () => {
  test('selects maximal vector-only subtrees without selecting nested fragments', () => {
    const document = normalizeDocument([
      { guid: { sessionID: 8, localID: 1 }, type: 'FRAME', name: 'Card' },
      { guid: { sessionID: 8, localID: 2 }, type: 'TEXT', name: 'Title', parentIndex: 0, textData: { characters: 'Title' } },
      { guid: { sessionID: 8, localID: 3 }, type: 'FRAME', name: 'Layer_1', parentIndex: 0 },
      { guid: { sessionID: 8, localID: 4 }, type: 'FRAME', name: 'Group', parentIndex: 2 },
      { guid: { sessionID: 8, localID: 5 }, type: 'VECTOR', name: 'Vector', parentIndex: 3, vectorData: { vectorNetworkBlob: 7 } }
    ], { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });

    expect(findReadyAssetTargets(document).map((node) => node.id)).toEqual(['8:3']);
  });

  test('renders a vector-only subtree into an indexed PNG asset', async () => {
    const changes = [
      { guid: { sessionID: 9, localID: 1 }, type: 'FRAME', name: 'Layer_1', size: { x: 16, y: 16 }, transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 } },
      {
        guid: { sessionID: 9, localID: 2 },
        type: 'VECTOR',
        name: 'Vector',
        parentIndex: 0,
        size: { x: 10, y: 10 },
        transform: { m00: 1, m01: 0, m02: 3, m10: 0, m11: 1, m12: 3 },
        fillPaints: [{ type: 'SOLID', color: { r: 0.3764705955982208, g: 0.16862745583057404, b: 0.47843137383461, a: 1 }, opacity: 1, visible: true }],
        vectorData: { vectorNetworkBlob: 7, normalizedSize: { x: 10, y: 10 } }
      }
    ];
    const document = normalizeDocument(changes, { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });
    const blob = makeRectVectorNetworkBlob(10, 10);

    const result = await renderReadyAssets({ document, changes, vectors: [{ blobId: 7, bytes: blob }], scale: 2 });

    expect(result.warnings).toEqual([]);
    expect(result.readyAssets).toHaveLength(1);
    expect(result.readyAssets[0]).toMatchObject({
      id: 'rendered-vector-subtree-9_1',
      sourceNodeId: '9:1',
      format: 'png',
      width: 16,
      height: 16,
      scale: 2
    });
    expect(Array.from(result.readyAssets[0]!.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(result.readyAssetRefs['9:1']!.path).toBe('assets/ready/rendered-vector-subtree-9_1.png');
  });

  test('returns an unsupported vector warning without dropping the original vector reference', async () => {
    const changes = [
      { guid: { sessionID: 10, localID: 1 }, type: 'FRAME', name: 'Layer_1', size: { x: 16, y: 16 } },
      { guid: { sessionID: 10, localID: 2 }, type: 'VECTOR', name: 'Vector', parentIndex: 0, vectorData: { vectorNetworkBlob: 7 } }
    ];
    const document = normalizeDocument(changes, { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });

    const result = await renderReadyAssets({ document, changes, vectors: [{ blobId: 7, bytes: Uint8Array.from([1, 2, 3]) }] });

    expect(document.nodesById['10:2']!.vectorRef).toEqual({
      blobId: 7,
      path: 'assets/vectors/vector-network-7.bin.gz',
      format: 'kiwi-vector-network',
      compression: 'gzip'
    });
    expect(result.readyAssets).toEqual([]);
    expect(result.readyAssetRefs).toEqual({});
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'UNSUPPORTED_VECTOR_NETWORK',
        nodeId: '10:1'
      })
    ]);
  });
});

function makeRectVectorNetworkBlob(width: number, height: number): Uint8Array {
  const buffer = new ArrayBuffer(4 + 4 + 4 + 8 * 4);
  const view = new DataView(buffer);
  view.setUint32(0, 4, true);
  view.setUint32(4, 4, true);
  view.setUint32(8, 1, true);
  const points = [0, 0, width, 0, width, height, 0, height];
  points.forEach((value, index) => view.setFloat32(12 + index * 4, value, true));
  return new Uint8Array(buffer);
}
