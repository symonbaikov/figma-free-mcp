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
  const pointOffset = 12;
  const requiredBytes = pointOffset + vertexCount * 2 * 4;
  if (vertexCount < 2 || segmentCount < 1 || regionCount < 1 || requiredBytes > bytes.byteLength) {
    throw new UnsupportedVectorNetworkError('Unsupported vector network blob layout.');
  }

  const points = Array.from({ length: vertexCount }, (_value, index) => {
    const offset = pointOffset + index * 8;
    return { x: view.getFloat32(offset, true), y: view.getFloat32(offset + 4, true) };
  });

  const [first, ...rest] = points;
  if (!first) throw new UnsupportedVectorNetworkError('Vector network has no points.');
  const d = [`M ${format(first.x)} ${format(first.y)}`, ...rest.map((point) => `L ${format(point.x)} ${format(point.y)}`), 'Z'].join(' ');
  return [{ d }];
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
