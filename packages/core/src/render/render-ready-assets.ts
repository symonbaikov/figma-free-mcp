import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import type { BundleReadyAsset, BundleVector } from '../bundle/write-bundle.js';
import type { AgentDocument, ReadyAssetReference } from '../normalize/document.js';
import { renderSubtreeToSvg } from './svg-scene.js';
import { findReadyAssetTargets } from './targets.js';
import type { ReadyAssetRenderResult, ReadyAssetWarning } from './types.js';
import { UnsupportedVectorNetworkError } from './vector-network.js';

const MAX_READY_ASSET_OUTPUT_PIXELS = 1_000_000;

export interface RenderReadyAssetsInput {
  document: AgentDocument;
  changes: readonly Record<string, unknown>[];
  vectors: readonly BundleVector[];
  targetNodeIds?: ReadonlySet<string>;
  scale?: number;
}

export async function renderReadyAssets(input: RenderReadyAssetsInput): Promise<ReadyAssetRenderResult> {
  const scale = input.scale ?? 2;
  const changesById = new Map(input.changes.map((change, index) => [idFromGuid(change.guid, index), change]));
  const vectorBytesByBlobId = new Map(input.vectors.map((vector) => [vector.blobId, vector.bytes]));
  const readyAssets: BundleReadyAsset[] = [];
  const readyAssetRefs: Record<string, ReadyAssetReference> = {};
  const warnings: ReadyAssetWarning[] = [];

  for (const target of findReadyAssetTargets(input.document).filter((node) => !input.targetNodeIds || input.targetNodeIds.has(node.id))) {
    try {
      const size = sizeFromBounds(target.bounds);
      const outputPixels = size.width * size.height * scale * scale;
      if (outputPixels > MAX_READY_ASSET_OUTPUT_PIXELS) {
        warnings.push({
          code: 'READY_ASSET_TOO_LARGE',
          nodeId: target.id,
          message: `Ready asset render would be ${size.width * scale}x${size.height * scale}px, exceeding ${MAX_READY_ASSET_OUTPUT_PIXELS} output pixels.`
        });
        continue;
      }
      const svg = renderSubtreeToSvg({ document: input.document, root: target, changesById, vectorBytesByBlobId });
      const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale } }).render().asPng();
      const bytes = new Uint8Array(png);
      const id = `rendered-vector-subtree-${target.id.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const reference: ReadyAssetReference = {
        id,
        sourceNodeId: target.id,
        path: `assets/ready/${id}.png`,
        kind: 'rendered-vector-subtree',
        format: 'png',
        width: size.width,
        height: size.height,
        scale,
        sha256
      };
      readyAssets.push({ ...reference, bytes });
      readyAssetRefs[target.id] = reference;
    } catch (error) {
      warnings.push({
        code: error instanceof UnsupportedVectorNetworkError ? 'UNSUPPORTED_VECTOR_NETWORK' : 'RENDER_READY_ASSET_FAILED',
        nodeId: target.id,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { readyAssets, readyAssetRefs, warnings };
}

function idFromGuid(value: unknown, fallback: number): string {
  const guid = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  return typeof guid?.sessionID === 'number' && typeof guid.localID === 'number' ? `${guid.sessionID}:${guid.localID}` : `index:${fallback}`;
}

function sizeFromBounds(value: unknown): { width: number; height: number } {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  return {
    width: typeof record?.x === 'number' ? Math.max(1, Math.ceil(record.x)) : 1,
    height: typeof record?.y === 'number' ? Math.max(1, Math.ceil(record.y)) : 1
  };
}
