import { FigctxError } from '../errors.js';
import type { AgentDocument, AgentNode, VectorReference } from '../normalize/document.js';
import { vectorNetworkToPath } from '../vector-network.js';

export type LoadVector = (reference: VectorReference) => Promise<Uint8Array>;

/** Renders the visible vector descendants of a normalized node as a standalone SVG. */
export async function exportNodeSvg(document: AgentDocument, node: AgentNode, loadVector: LoadVector): Promise<string> {
  const size = dimensions(node.bounds);
  if (!size) throw new FigctxError('NODE_NOT_FOUND', `Node ${node.id} has no exportable dimensions.`);
  const content = await renderNode(document, node, loadVector, true);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${number(size.width)} ${number(size.height)}" width="${number(size.width)}" height="${number(size.height)}">${content}</svg>`;
}

async function renderNode(document: AgentDocument, node: AgentNode, loadVector: LoadVector, root: boolean): Promise<string> {
  if (node.visible === false) return '';
  const own = node.type === 'VECTOR' && node.vectorRef ? renderVector(node, await loadVector(node.vectorRef)) : '';
  const children = await Promise.all(node.childIds.map(async (id) => {
    const child = document.nodesById[id];
    return child ? renderNode(document, child, loadVector, false) : '';
  }));
  const content = `${own}${children.join('')}`;
  if (!content || root) return content;
  const attributes = groupAttributes(node);
  return attributes ? `<g ${attributes}>${content}</g>` : content;
}

function renderVector(node: AgentNode, bytes: Uint8Array): string {
  const path = vectorNetworkToPath(bytes);
  if (!path) return '';
  const fill = paintAttribute('fill', node.fills);
  const stroke = paintAttribute('stroke', node.strokes);
  return `<path d="${path}"${fill}${stroke}/>`;
}

function groupAttributes(node: AgentNode): string {
  const attributes: string[] = [];
  const transform = matrix(node.transform);
  if (transform && transform !== 'matrix(1 0 0 1 0 0)') attributes.push(`transform="${transform}"`);
  if (typeof node.opacity === 'number' && node.opacity !== 1) attributes.push(`opacity="${number(node.opacity)}"`);
  return attributes.join(' ');
}

function paintAttribute(name: 'fill' | 'stroke', value: unknown): string {
  const paint = Array.isArray(value) ? value.find((candidate) => record(candidate)?.visible !== false && record(candidate)?.type === 'SOLID') : undefined;
  const color = record(record(paint)?.color);
  if (!color) return name === 'fill' ? ' fill="none"' : '';
  const red = channel(color.r); const green = channel(color.g); const blue = channel(color.b);
  const opacity = numeric(record(paint)?.opacity, 1) * numeric(color.a, 1);
  return ` ${name}="#${hex(red)}${hex(green)}${hex(blue)}"${opacity < 1 ? ` ${name}-opacity="${number(opacity)}"` : ''}`;
}

function dimensions(value: unknown): { width: number; height: number } | undefined {
  const bounds = record(value);
  const width = numeric(bounds?.x); const height = numeric(bounds?.y);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function matrix(value: unknown): string | undefined {
  const transform = record(value);
  if (!transform) return undefined;
  return `matrix(${number(numeric(transform.m00, 1))} ${number(numeric(transform.m10, 0))} ${number(numeric(transform.m01, 0))} ${number(numeric(transform.m11, 1))} ${number(numeric(transform.m02, 0))} ${number(numeric(transform.m12, 0))})`;
}

function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function numeric(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function channel(value: unknown): number { return Math.min(255, Math.max(0, Math.round(numeric(value) * 255))); }
function hex(value: number): string { return value.toString(16).padStart(2, '0'); }
function number(value: number): string { return Number((Math.abs(value) < 1e-9 ? 0 : value).toFixed(6)).toString(); }
