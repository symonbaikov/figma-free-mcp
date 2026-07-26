import { gunzip } from 'node:zlib';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { exportNodeSvg, FigctxError, resolveNodeReference, type AgentDocument, type VectorReference } from '@figctx/core';

const unzip = promisify(gunzip);

export async function exportBundleNodeSvg(bundle: string, reference: string, out: string): Promise<{ nodeId: string; out: string }> {
  const document = JSON.parse(await readFile(resolve(bundle, 'document.agent.json'), 'utf8')) as AgentDocument;
  const node = resolveNodeReference(document, reference);
  const svg = await exportNodeSvg(document, node, (vector) => loadVector(bundle, vector));
  await writeTextAtomic(out, svg);
  return { nodeId: node.id, out };
}

async function loadVector(bundle: string, vector: VectorReference): Promise<Uint8Array> {
  const path = bundlePath(bundle, vector.path);
  try { return new Uint8Array(await unzip(await readFile(path))); }
  catch (error) { throw new FigctxError('INVALID_VECTOR_NETWORK', `Cannot read vector blob ${vector.blobId}.`, error); }
}

function bundlePath(bundle: string, path: string): string {
  const root = resolve(bundle);
  const candidate = resolve(root, path);
  const fromRoot = relative(root, candidate);
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new FigctxError('INVALID_BUNDLE_ASSET', `Vector path escapes bundle: ${path}`);
  return candidate;
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, value);
  await rename(temporary, path);
}
