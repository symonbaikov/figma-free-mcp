import type { AgentDocument, AgentNode } from '../normalize/document.js';
import { vectorNetworkToPaths } from './vector-network.js';

export interface SvgSceneInput {
  document: AgentDocument;
  root: AgentNode;
  changesById: ReadonlyMap<string, Record<string, unknown>>;
  vectorBytesByBlobId: ReadonlyMap<number, Uint8Array>;
}

export function renderSubtreeToSvg(input: SvgSceneInput): string {
  const size = rectSize(input.root.bounds);
  const body = input.root.visible === false
    ? ''
    : input.root.vectorRef
    ? renderNode(input, input.root.id, identityMatrix(), input.root)
    : input.root.childIds.map((childId) => renderNode(input, childId, identityMatrix(), input.root)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">${body}</svg>`;
}

function renderNode(input: SvgSceneInput, nodeId: string, parentTransform: Matrix, root: AgentNode): string {
  const node = input.document.nodesById[nodeId];
  if (!node || node.visible === false) return '';
  const change = input.changesById.get(node.id);
  const transform = node.id === root.id ? withoutTranslation(matrix(change?.transform)) : multiply(parentTransform, matrix(change?.transform));

  if (node.vectorRef) {
    const bytes = input.vectorBytesByBlobId.get(node.vectorRef.blobId);
    if (!bytes) throw new Error(`Missing vector blob ${node.vectorRef.blobId}.`);
    const fill = firstSolidFill(change?.fillPaints);
    return vectorNetworkToPaths(bytes).map((path) => `<path d="${path.d}" transform="${formatMatrix(transform)}" fill="${fill}" />`).join('');
  }

  if (node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE') {
    const size = rectSize(node.bounds);
    const fill = firstSolidFill(change?.fillPaints);
    const radius = numberValue(change?.cornerRadius);
    return `<rect x="0" y="0" width="${format(size.width)}" height="${format(size.height)}" rx="${format(radius)}" transform="${formatMatrix(transform)}" fill="${fill}" />`;
  }

  return node.childIds.map((childId) => renderNode(input, childId, transform, root)).join('');
}

function rectSize(value: unknown): { width: number; height: number } {
  const record = objectValue(value);
  const width = typeof record?.x === 'number' ? Math.max(1, Math.ceil(record.x)) : 1;
  const height = typeof record?.y === 'number' ? Math.max(1, Math.ceil(record.y)) : 1;
  return { width, height };
}

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function matrix(value: unknown): Matrix {
  const record = objectValue(value);
  return {
    a: typeof record?.m00 === 'number' ? record.m00 : 1,
    b: typeof record?.m10 === 'number' ? record.m10 : 0,
    c: typeof record?.m01 === 'number' ? record.m01 : 0,
    d: typeof record?.m11 === 'number' ? record.m11 : 1,
    e: typeof record?.m02 === 'number' ? record.m02 : 0,
    f: typeof record?.m12 === 'number' ? record.m12 : 0
  };
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  };
}

function withoutTranslation(value: Matrix): Matrix {
  return { ...value, e: 0, f: 0 };
}

function identityMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function firstSolidFill(value: unknown): string {
  if (!Array.isArray(value)) return 'transparent';
  const fill = value.map(objectValue).find((paint) => paint?.type === 'SOLID' && paint.visible !== false);
  const color = objectValue(fill?.color);
  if (!color) return 'transparent';
  const r = Math.round(numberOrZero(color.r) * 255);
  const g = Math.round(numberOrZero(color.g) * 255);
  const b = Math.round(numberOrZero(color.b) * 255);
  const a = fill?.opacity !== undefined ? numberOrZero(fill.opacity) : numberOrZero(color.a ?? 1);
  return `rgba(${r},${g},${b},${a})`;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function formatMatrix(value: Matrix): string {
  return `matrix(${format(value.a)} ${format(value.b)} ${format(value.c)} ${format(value.d)} ${format(value.e)} ${format(value.f)})`;
}
