import { describe, expect, test } from 'vitest';
import { vectorNetworkToPath } from '../src/vector-network.js';

describe('vectorNetworkToPath', () => {
  test('renders a closed triangular region from straight segments', () => {
    expect(vectorNetworkToPath(vectorNetwork({
      vertices: [[0, 0], [10, 0], [0, 10]],
      segments: [[0, 1], [1, 2], [2, 0]],
      loops: [[0, 1, 2]]
    }))).toBe('M 0 0 L 10 0 L 0 10 Z');
  });

  test('renders cubic control points relative to their segment vertices', () => {
    expect(vectorNetworkToPath(vectorNetwork({
      vertices: [[0, 0], [10, 0]],
      segments: [[0, 1, 2, 3, -4, 5]],
      loops: [[0]]
    }))).toBe('M 0 0 C 2 3 6 5 10 0 Z');
  });

  test('rejects truncated data', () => {
    expect(() => vectorNetworkToPath(Uint8Array.of(1))).toThrow(/truncated/i);
  });

  test('rejects a segment that refers to a missing vertex', () => {
    const bytes = vectorNetwork({ vertices: [[0, 0]], segments: [[0, 0]], loops: [[0]] });
    new DataView(bytes.buffer).setUint32(12 + 12 + 4, 3, true);
    expect(() => vectorNetworkToPath(bytes)).toThrow(/vertex index/i);
  });
});

function vectorNetwork(input: {
  vertices: Array<[number, number]>;
  segments: Array<[number, number, number?, number?, number?, number?]>;
  loops: number[][];
}): Uint8Array {
  const length = 12 + input.vertices.length * 12 + input.segments.length * 28 + 8 + input.loops.reduce((total, loop) => total + 4 + loop.length * 4, 0);
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const uint = (value: number) => { view.setUint32(offset, value, true); offset += 4; };
  const float = (value: number) => { view.setFloat32(offset, value, true); offset += 4; };
  uint(input.vertices.length); uint(input.segments.length); uint(1);
  for (const [x, y] of input.vertices) { uint(0); float(x); float(y); }
  for (const [start, end, tangentStartX = 0, tangentStartY = 0, tangentEndX = 0, tangentEndY = 0] of input.segments) {
    uint(0); uint(start); float(tangentStartX); float(tangentStartY); uint(end); float(tangentEndX); float(tangentEndY);
  }
  uint(0); uint(input.loops.length);
  for (const loop of input.loops) { uint(loop.length); for (const segmentIndex of loop) uint(segmentIndex); }
  return bytes;
}
