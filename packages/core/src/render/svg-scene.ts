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
  const body = input.root.vectorRef
    ? renderNode(input, input.root.id, 0, 0, input.root)
    : input.root.childIds.map((childId) => renderNode(input, childId, 0, 0, input.root)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">${body}</svg>`;
}

function renderNode(input: SvgSceneInput, nodeId: string, parentX: number, parentY: number, root: AgentNode): string {
  const node = input.document.nodesById[nodeId];
  if (!node || node.visible === false) return '';
  const change = input.changesById.get(node.id);
  const transform = matrix(change?.transform);
  const rootTransform = node.id === root.id ? transform : { x: 0, y: 0 };
  const x = parentX + transform.x - rootTransform.x;
  const y = parentY + transform.y - rootTransform.y;

  if (node.vectorRef) {
    const bytes = input.vectorBytesByBlobId.get(node.vectorRef.blobId);
    if (!bytes) throw new Error(`Missing vector blob ${node.vectorRef.blobId}.`);
    const fill = firstSolidFill(change?.fillPaints);
    return vectorNetworkToPaths(bytes).map((path) => `<path d="${path.d}" transform="translate(${format(x)} ${format(y)})" fill="${fill}" />`).join('');
  }

  if (node.type === 'RECTANGLE' || node.type === 'ROUNDED_RECTANGLE') {
    const size = rectSize(node.bounds);
    const fill = firstSolidFill(change?.fillPaints);
    const radius = numberValue(change?.cornerRadius);
    return `<rect x="${format(x)}" y="${format(y)}" width="${format(size.width)}" height="${format(size.height)}" rx="${format(radius)}" fill="${fill}" />`;
  }

  return node.childIds.map((childId) => renderNode(input, childId, x, y, root)).join('');
}

function rectSize(value: unknown): { width: number; height: number } {
  const record = objectValue(value);
  const width = typeof record?.x === 'number' ? Math.max(1, Math.ceil(record.x)) : 1;
  const height = typeof record?.y === 'number' ? Math.max(1, Math.ceil(record.y)) : 1;
  return { width, height };
}

function matrix(value: unknown): { x: number; y: number } {
  const record = objectValue(value);
  return { x: typeof record?.m02 === 'number' ? record.m02 : 0, y: typeof record?.m12 === 'number' ? record.m12 : 0 };
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
