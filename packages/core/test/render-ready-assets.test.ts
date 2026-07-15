import { describe, expect, test } from 'vitest';
import { normalizeDocument } from '../src/normalize/document.js';
import { renderReadyAssets } from '../src/render/render-ready-assets.js';
import { renderSubtreeToSvg } from '../src/render/svg-scene.js';
import { findReadyAssetTargets } from '../src/render/targets.js';
import { vectorNetworkToPaths } from '../src/render/vector-network.js';

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

  test('ready asset refs can be attached by a second normalization pass', async () => {
    const changes = [
      { guid: { sessionID: 10, localID: 1 }, type: 'FRAME', name: 'Layer_1', size: { x: 16, y: 16 } },
      { guid: { sessionID: 10, localID: 2 }, type: 'VECTOR', name: 'Vector', parentIndex: 0, vectorData: { vectorNetworkBlob: 7 }, size: { x: 10, y: 10 }, fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] }
    ];
    const firstPass = normalizeDocument(changes, { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });
    const rendered = await renderReadyAssets({ document: firstPass, changes, vectors: [{ blobId: 7, bytes: makeRectVectorNetworkBlob(10, 10) }] });
    const secondPass = normalizeDocument(changes, {
      vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' },
      readyAssetPaths: rendered.readyAssetRefs
    });

    expect(secondPass.nodesById['10:1']!.readyAssetRefs).toHaveLength(1);
  });

  test('can render only targets inside a selected node subtree', async () => {
    const changes = [
      { guid: { sessionID: 13, localID: 1 }, type: 'FRAME', name: 'Selected', size: { x: 16, y: 16 } },
      { guid: { sessionID: 13, localID: 2 }, type: 'VECTOR', name: 'SelectedVector', parentIndex: 0, vectorData: { vectorNetworkBlob: 7 }, fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] },
      { guid: { sessionID: 13, localID: 3 }, type: 'FRAME', name: 'Other', size: { x: 16, y: 16 } },
      { guid: { sessionID: 13, localID: 4 }, type: 'VECTOR', name: 'OtherVector', parentIndex: 2, vectorData: { vectorNetworkBlob: 7 }, fillPaints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 } }] }
    ];
    const document = normalizeDocument(changes, { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });
    const rendered = await renderReadyAssets({
      document,
      changes,
      vectors: [{ blobId: 7, bytes: makeRectVectorNetworkBlob(10, 10) }],
      targetNodeIds: new Set(['13:1', '13:2'])
    });

    expect(rendered.readyAssets.map((asset) => asset.sourceNodeId)).toEqual(['13:1']);
  });

  test('parses real vector-network blobs with 16-byte headers and 12-byte vertex records', () => {
    expect(vectorNetworkToPaths(makeRealRectVectorNetworkBlob(10, 5))).toEqual([
      { d: 'M 0 0 L 10 0 L 10 5 L 0 5 Z' }
    ]);
    expect(vectorNetworkToPaths(makeRealRectVectorNetworkBlob(10, 5, 108))).toEqual([
      { d: 'M 0 0 L 10 0 L 10 5 L 0 5 Z' }
    ]);
  });

  test('skips oversized ready assets before rasterization', async () => {
    const changes = [
      { guid: { sessionID: 13, localID: 1 }, type: 'FRAME', name: 'HugeVectorRoot', size: { x: 800, y: 400 } },
      { guid: { sessionID: 13, localID: 2 }, type: 'VECTOR', name: 'Vector', parentIndex: 0, vectorData: { vectorNetworkBlob: 7 }, size: { x: 10, y: 10 } }
    ];
    const document = normalizeDocument(changes, { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });

    const result = await renderReadyAssets({ document, changes, vectors: [{ blobId: 7, bytes: makeRectVectorNetworkBlob(10, 10) }], scale: 2 });

    expect(result.readyAssets).toEqual([]);
    expect(result.readyAssetRefs).toEqual({});
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'READY_ASSET_TOO_LARGE',
        nodeId: '13:1'
      })
    ]);
  });

  test('preserves scaled and rotated ancestor transforms in the generated SVG', () => {
    const changes = [
      { guid: { sessionID: 11, localID: 1 }, type: 'FRAME', name: 'Layer_1', size: { x: 24, y: 24 } },
      {
        guid: { sessionID: 11, localID: 2 },
        type: 'FRAME',
        name: 'Rotated',
        parentIndex: 0,
        transform: { m00: 0, m01: -2, m02: 5, m10: 2, m11: 0, m12: 7 }
      },
      {
        guid: { sessionID: 11, localID: 3 },
        type: 'VECTOR',
        name: 'Vector',
        parentIndex: 1,
        size: { x: 2, y: 2 },
        transform: { m00: 3, m01: 0, m02: 3, m10: 0, m11: 3, m12: 4 },
        fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
        vectorData: { vectorNetworkBlob: 7, normalizedSize: { x: 2, y: 2 } }
      }
    ];
    const document = normalizeDocument(changes, { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });
    const svg = renderSubtreeToSvg({
      document,
      root: document.nodesById['11:1']!,
      changesById: changesByNodeId(changes),
      vectorBytesByBlobId: new Map([[7, makeRectVectorNetworkBlob(2, 2)]])
    });

    expect(svg).toContain('transform="matrix(0 6 -6 0 -3 13)"');
    expect(svg).not.toContain('transform="translate(');
  });

  test('does not select or render hidden vector-only roots or groups', async () => {
    const changes = [
      { guid: { sessionID: 12, localID: 1 }, type: 'FRAME', name: 'HiddenRoot', size: { x: 16, y: 16 }, visible: false },
      { guid: { sessionID: 12, localID: 2 }, type: 'VECTOR', name: 'RootVector', parentIndex: 0, vectorData: { vectorNetworkBlob: 7 } },
      { guid: { sessionID: 12, localID: 3 }, type: 'FRAME', name: 'VisibleRoot', size: { x: 16, y: 16 } },
      { guid: { sessionID: 12, localID: 4 }, type: 'FRAME', name: 'HiddenGroup', parentIndex: 2, visible: false },
      { guid: { sessionID: 12, localID: 5 }, type: 'VECTOR', name: 'GroupVector', parentIndex: 3, vectorData: { vectorNetworkBlob: 7 } }
    ];
    const document = normalizeDocument(changes, { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });
    const vectors = [{ blobId: 7, bytes: makeRectVectorNetworkBlob(10, 10) }];

    expect(findReadyAssetTargets(document).map((node) => node.id)).toEqual([]);
    await expect(renderReadyAssets({ document, changes, vectors })).resolves.toMatchObject({
      readyAssets: [],
      readyAssetRefs: {},
      warnings: []
    });
    expect(renderSubtreeToSvg({
      document,
      root: document.nodesById['12:1']!,
      changesById: changesByNodeId(changes),
      vectorBytesByBlobId: new Map([[7, makeRectVectorNetworkBlob(10, 10)]])
    })).not.toContain('<path');
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

function makeRealRectVectorNetworkBlob(width: number, height: number, trailingBytes = 0): Uint8Array {
  const buffer = new ArrayBuffer(16 + 4 * 12 + trailingBytes);
  const view = new DataView(buffer);
  view.setUint32(0, 4, true);
  view.setUint32(4, 4, true);
  view.setUint32(8, 0, true);
  view.setUint32(12, 0, true);
  const points = [0, 0, 0, width, 0, 0, width, height, 0, 0, height, 0];
  points.forEach((value, index) => view.setFloat32(16 + index * 4, value, true));
  return new Uint8Array(buffer);
}

function changesByNodeId(changes: readonly Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  return new Map(changes.map((change, index) => [idFromGuid(change.guid, index), change]));
}

function idFromGuid(value: unknown, fallback: number): string {
  const guid = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  return typeof guid?.sessionID === 'number' && typeof guid.localID === 'number' ? `${guid.sessionID}:${guid.localID}` : `index:${fallback}`;
}
