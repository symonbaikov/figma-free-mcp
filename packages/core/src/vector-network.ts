import { FigctxError } from './errors.js';

interface Vertex { x: number; y: number; }
interface Segment { start: number; end: number; tangentStartX: number; tangentStartY: number; tangentEndX: number; tangentEndY: number; }

/** Converts Figma's local editable vector-network blob into SVG path data. */
export function vectorNetworkToPath(bytes: Uint8Array): string {
  const reader = new VectorReader(bytes);
  const vertexCount = reader.uint32('header');
  const segmentCount = reader.uint32('header');
  const regionCount = reader.uint32('header');
  const vertices = Array.from({ length: vertexCount }, () => ({ flags: reader.uint32('vertex'), x: reader.float32('vertex'), y: reader.float32('vertex') })).map(({ x, y }) => ({ x, y }));
  const segments = Array.from({ length: segmentCount }, () => {
    reader.uint32('segment');
    const start = reader.uint32('segment');
    const tangentStartX = reader.float32('segment');
    const tangentStartY = reader.float32('segment');
    const end = reader.uint32('segment');
    const tangentEndX = reader.float32('segment');
    const tangentEndY = reader.float32('segment');
    if (start >= vertexCount || end >= vertexCount) throw invalid(`Segment refers to vertex index outside 0..${Math.max(vertexCount - 1, 0)}.`);
    return { start, end, tangentStartX, tangentStartY, tangentEndX, tangentEndY };
  });
  const loops = readLoops(reader, regionCount, segmentCount);
  if (!segments.length) return '';
  return loops.length ? loops.map((loop) => renderLoop(loop, segments, vertices)).join(' ') : renderSegments(segments, vertices);
}

function readLoops(reader: VectorReader, regionCount: number, segmentCount: number): number[][] {
  const loops: number[][] = [];
  for (let region = 0; region < regionCount; region += 1) {
    reader.uint32('region');
    const loopCount = reader.uint32('region');
    for (let loop = 0; loop < loopCount; loop += 1) {
      const count = reader.uint32('region loop');
      const indices = Array.from({ length: count }, () => reader.uint32('region loop'));
      if (indices.some((index) => index >= segmentCount)) throw invalid(`Region refers to segment index outside 0..${Math.max(segmentCount - 1, 0)}.`);
      loops.push(indices);
    }
  }
  return loops;
}

function renderLoop(indices: readonly number[], segments: readonly Segment[], vertices: readonly Vertex[]): string {
  if (!indices.length) return '';
  const first = segments[indices[0]]!;
  let current = first.start;
  const parts = [`M ${point(vertices[current]!)}`];
  for (const [position, index] of indices.entries()) {
    const segment = segments[index]!;
    const reversed = segment.end === current && segment.start !== current;
    if (segment.start !== current && segment.end !== current) throw invalid('Region loop contains disconnected segments.');
    const next = reversed ? segment.start : segment.end;
    if (position !== indices.length - 1 || next !== first.start || isCurved(segment)) parts.push(command(segment, vertices, reversed));
    current = next;
  }
  return `${parts.join(' ')} Z`;
}

function renderSegments(segments: readonly Segment[], vertices: readonly Vertex[]): string {
  const parts: string[] = [];
  let current: number | undefined;
  for (const segment of segments) {
    const reversed = current === segment.end && current !== segment.start;
    if (current === undefined || (segment.start !== current && segment.end !== current)) {
      current = segment.start;
      parts.push(`M ${point(vertices[current]!)}`);
    }
    parts.push(command(segment, vertices, reversed));
    current = reversed ? segment.start : segment.end;
  }
  return parts.join(' ');
}

function command(segment: Segment, vertices: readonly Vertex[], reversed: boolean): string {
  const start = vertices[reversed ? segment.end : segment.start]!;
  const end = vertices[reversed ? segment.start : segment.end]!;
  const startTangentX = reversed ? segment.tangentEndX : segment.tangentStartX;
  const startTangentY = reversed ? segment.tangentEndY : segment.tangentStartY;
  const endTangentX = reversed ? segment.tangentStartX : segment.tangentEndX;
  const endTangentY = reversed ? segment.tangentStartY : segment.tangentEndY;
  const curved = isCurved({ tangentStartX: startTangentX, tangentStartY: startTangentY, tangentEndX: endTangentX, tangentEndY: endTangentY });
  return curved ? `C ${number(start.x + startTangentX)} ${number(start.y + startTangentY)} ${number(end.x + endTangentX)} ${number(end.y + endTangentY)} ${point(end)}` : `L ${point(end)}`;
}

function isCurved(segment: Pick<Segment, 'tangentStartX' | 'tangentStartY' | 'tangentEndX' | 'tangentEndY'>): boolean {
  return [segment.tangentStartX, segment.tangentStartY, segment.tangentEndX, segment.tangentEndY].some((value) => Math.abs(value) > 0.001);
}

function point(vertex: Vertex): string { return `${number(vertex.x)} ${number(vertex.y)}`; }
function number(value: number): string {
  if (!Number.isFinite(value)) throw invalid('Vector data contains a non-finite coordinate.');
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  return Number(normalized.toFixed(6)).toString();
}
function invalid(message: string): FigctxError { return new FigctxError('INVALID_VECTOR_NETWORK', message); }

class VectorReader {
  readonly #view: DataView;
  #offset = 0;

  constructor(bytes: Uint8Array) { this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

  uint32(section: string): number { this.#require(4, section); const value = this.#view.getUint32(this.#offset, true); this.#offset += 4; return value; }
  float32(section: string): number { this.#require(4, section); const value = this.#view.getFloat32(this.#offset, true); this.#offset += 4; return value; }

  #require(length: number, section: string): void {
    if (this.#offset + length > this.#view.byteLength) throw invalid(`Truncated ${section} data at byte ${this.#offset}.`);
  }
}
