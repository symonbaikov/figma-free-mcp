import { describe, expect, test } from 'vitest';
import { hashToHex, normalizeDocument, resolveNodeReference, type AgentDocument } from '../src/normalize/document.js';
import { buildNodeContext } from '../src/context/node-context.js';

const document = normalizeDocument([
  { guid: { sessionID: 1, localID: 1 }, type: 'DOCUMENT', name: 'Document' },
  { guid: { sessionID: 1, localID: 2 }, type: 'FRAME', name: 'Hero', parentIndex: 0, size: { x: 100, y: 50 } },
  { guid: { sessionID: 1, localID: 3 }, type: 'TEXT', name: 'Title', parentIndex: 1, textData: { characters: 'Hello' } }
]);

describe('normalized document', () => {
  test('builds stable IDs, hierarchy, and text context', () => {
    expect(document.nodesById['1:2']).toMatchObject({ id: '1:2', type: 'FRAME', childIds: ['1:3'] });
    expect(document.nodesById['1:3']).toMatchObject({ text: 'Hello', parentId: '1:2' });
  });

  test.each(['1:3', '1-3', 'https://www.figma.com/design/file/name?node-id=1-3'])
  ('resolves %s', (reference) => expect(resolveNodeReference(document, reference).id).toBe('1:3'));

  test('rejects a Figma URL for another file key', () => {
    const keyed = normalizeDocument([], { originFileKey: 'local-file' });
    expect(() => resolveNodeReference(keyed, 'https://www.figma.com/design/other-file/name?node-id=1-3')).toThrow(/bundle is for local-file/);
  });

  test('links an image fill to its extracted asset path', () => {
    const hash = Uint8Array.from({ length: 20 }, (_value, index) => index);
    const normalized = normalizeDocument([{ guid: { sessionID: 2, localID: 4 }, fillPaints: [{ type: 'IMAGE', image: { hash } }] }], { assetPaths: { [hashToHex(hash)!]: 'assets/images/example.png' } });
    expect(normalized.nodesById['2:4']!.assetRefs).toEqual([{ hash: hashToHex(hash), path: 'assets/images/example.png', kind: 'image-fill' }]);
  });

  test('preserves a vector-network blob reference', () => {
    const normalized = normalizeDocument([{ guid: { sessionID: 2, localID: 5 }, vectorData: { vectorNetworkBlob: 7 } }], { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });
    expect(normalized.nodesById['2:5']!.vectorRef).toEqual({ blobId: 7, path: 'assets/vectors/vector-network-7.bin.gz', format: 'kiwi-vector-network', compression: 'gzip' });
  });

  test('links a rendered vector subtree to its ready PNG asset path', () => {
    const normalized = normalizeDocument([
      { guid: { sessionID: 6, localID: 1 }, type: 'FRAME', name: 'Layer_1' }
    ], {
      readyAssetPaths: {
        '6:1': {
          id: 'rendered-vector-subtree-6_1',
          sourceNodeId: '6:1',
          path: 'assets/ready/rendered-vector-subtree-6_1.png',
          kind: 'rendered-vector-subtree',
          format: 'png',
          width: 253,
          height: 240,
          scale: 2,
          sha256: '00'.repeat(32)
        }
      }
    });

    expect(normalized.nodesById['6:1']!.readyAssetRefs).toEqual([
      {
        id: 'rendered-vector-subtree-6_1',
        sourceNodeId: '6:1',
        path: 'assets/ready/rendered-vector-subtree-6_1.png',
        kind: 'rendered-vector-subtree',
        format: 'png',
        width: 253,
        height: 240,
        scale: 2,
        sha256: '00'.repeat(32)
      }
    ]);
  });

  test('collects every descendant text and asset for a frame context', () => {
    const normalized = normalizeDocument([
      { guid: { sessionID: 4, localID: 1 }, type: 'FRAME' },
      { guid: { sessionID: 4, localID: 2 }, type: 'TEXT', parentIndex: 0, textData: { characters: 'Nested' } },
      { guid: { sessionID: 4, localID: 3 }, type: 'RECTANGLE', parentIndex: 1, fillPaints: [{ type: 'IMAGE', image: { hash: Uint8Array.from({ length: 20 }, () => 1) } }] }
    ], { assetPaths: { ['01'.repeat(20)]: 'assets/images/nested.png' } });
    const context = buildNodeContext(normalized, normalized.nodesById['4:1']!);
    expect(context.nodeIds).toEqual(['4:1', '4:2', '4:3']);
    expect(context.text).toEqual([expect.objectContaining({ id: '4:2', text: 'Nested' })]);
    expect(context.assets).toEqual([{ hash: '01'.repeat(20), path: 'assets/images/nested.png', kind: 'image-fill' }]);
  });

  test('collects descendant ready assets for a frame context', () => {
    const normalized = normalizeDocument([
      { guid: { sessionID: 7, localID: 1 }, type: 'FRAME', name: 'Card' },
      { guid: { sessionID: 7, localID: 2 }, type: 'FRAME', name: 'Layer_1', parentIndex: 0 }
    ], {
      readyAssetPaths: {
        '7:2': {
          id: 'rendered-vector-subtree-7_2',
          sourceNodeId: '7:2',
          path: 'assets/ready/rendered-vector-subtree-7_2.png',
          kind: 'rendered-vector-subtree',
          format: 'png',
          width: 120,
          height: 80,
          scale: 2,
          sha256: '11'.repeat(32)
        }
      }
    });

    const context = buildNodeContext(normalized, normalized.nodesById['7:1']!);
    expect(context.readyAssets).toEqual([
      expect.objectContaining({
        id: 'rendered-vector-subtree-7_2',
        sourceNodeId: '7:2',
        path: 'assets/ready/rendered-vector-subtree-7_2.png'
      })
    ]);
  });

  test('treats old bundle nodes without ready asset references as having none', () => {
    const oldBundle = {
      contractVersion: '1',
      rootIds: ['8:1'],
      nodesById: {
        '8:1': {
          id: '8:1',
          name: 'Legacy Frame',
          type: 'FRAME',
          childIds: ['8:2'],
          zIndex: 0,
          assetRefs: []
        },
        '8:2': {
          id: '8:2',
          name: 'Legacy Child',
          type: 'RECTANGLE',
          parentId: '8:1',
          childIds: [],
          zIndex: 1,
          assetRefs: []
        }
      }
    } as unknown as AgentDocument;

    const context = buildNodeContext(oldBundle, oldBundle.nodesById['8:1']!);

    expect(context.readyAssets).toEqual([]);
  });

  test('retains Figma-computed text layout and visibility fields', () => {
    const normalized = normalizeDocument([{ guid: { sessionID: 5, localID: 1 }, type: 'TEXT', visible: false, opacity: 0.6, textData: { characters: 'Measured' }, derivedTextData: { layoutSize: { x: 80, y: 20 }, baselines: [{ position: { x: 0, y: 14 } }], glyphs: [{ commandsBlob: 99 }] } }]);
    expect(normalized.nodesById['5:1']).toMatchObject({ visible: false, opacity: 0.6, textLayout: { layoutSize: { x: 80, y: 20 }, baselines: [{ position: { x: 0, y: 14 } }] } });
    expect(normalized.nodesById['5:1']!.textLayout).not.toHaveProperty('glyphs');
  });
});
