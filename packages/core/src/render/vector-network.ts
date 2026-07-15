export interface VectorPath {
  d: string;
}

export class UnsupportedVectorNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedVectorNetworkError';
  }
}

export function vectorNetworkToPaths(bytes: Uint8Array): VectorPath[] {
  if (bytes.byteLength < 12) throw new UnsupportedVectorNetworkError('Vector network blob is too small.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vertexCount = view.getUint32(0, true);
  const segmentCount = view.getUint32(4, true);
  const regionCount = view.getUint32(8, true);

  if (vertexCount < 2 || segmentCount < 1) {
    throw new UnsupportedVectorNetworkError('Unsupported vector network blob layout.');
  }

  if (regionCount >= 1 && bytes.byteLength === 12 + vertexCount * 8) {
    return pathFromPoints(Array.from({ length: vertexCount }, (_value, index) => {
      const offset = 12 + index * 8;
      return { x: view.getFloat32(offset, true), y: view.getFloat32(offset + 4, true) };
    }));
  }

  if (bytes.byteLength >= 16 + vertexCount * 12 && view.getUint32(12, true) === 0) {
    return pathFromPoints(Array.from({ length: vertexCount }, (_value, index) => {
      const offset = 16 + index * 12;
      return { x: view.getFloat32(offset, true), y: view.getFloat32(offset + 4, true) };
    }));
  }

  throw new UnsupportedVectorNetworkError('Unsupported vector network blob layout.');
}

function pathFromPoints(points: Array<{ x: number; y: number }>): VectorPath[] {
  const [first, ...rest] = points;
  if (!first) throw new UnsupportedVectorNetworkError('Vector network has no points.');
  if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    throw new UnsupportedVectorNetworkError('Vector network contains non-finite points.');
  }
  const d = [`M ${format(first.x)} ${format(first.y)}`, ...rest.map((point) => `L ${format(point.x)} ${format(point.y)}`), 'Z'].join(' ');
  return [{ d }];
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
