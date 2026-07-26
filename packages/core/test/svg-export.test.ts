import { describe, expect, test } from 'vitest';
import { normalizeDocument } from '../src/normalize/document.js';
import { exportNodeSvg } from '../src/svg/export.js';

const document = normalizeDocument([
  { guid: { sessionID: 1, localID: 1 }, type: 'FRAME', name: 'Hero', size: { x: 100, y: 50 } },
  { guid: { sessionID: 1, localID: 2 }, type: 'VECTOR', name: 'Shape', parentIndex: 0, size: { x: 10, y: 10 }, transform: { m00: 1, m01: 0, m02: 4, m10: 0, m11: 1, m12: 8 }, fillPaints: [{ type: 'SOLID', color: { r: 0.38, g: 0.16, b: 0.48, a: 1 } }], vectorData: { vectorNetworkBlob: 7 } },
  { guid: { sessionID: 1, localID: 3 }, type: 'VECTOR', name: 'Hidden', parentIndex: 0, visible: false, size: { x: 10, y: 10 }, vectorData: { vectorNetworkBlob: 7 } }
], { vectorPaths: { 7: 'assets/vectors/vector-network-7.bin.gz' } });

describe('exportNodeSvg', () => {
  test('uses the selected frame size, node transform, fill, and decoded path', async () => {
    const output = await exportNodeSvg(document, document.nodesById['1:1']!, async () => triangleBytes());
    expect(output).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50">');
    expect(output).toContain('<g transform="matrix(1 0 0 1 4 8)"><path d="M 0 0 L 10 0 L 0 10 Z" fill="#61297a"/></g>');
  });

  test('does not render hidden descendants', async () => {
    const output = await exportNodeSvg(document, document.nodesById['1:1']!, async () => triangleBytes());
    expect(output).not.toContain('Hidden');
    expect((output.match(/<path /g) ?? [])).toHaveLength(1);
  });
});

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
