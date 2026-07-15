import type { BundleReadyAsset } from '../bundle/write-bundle.js';
import type { ReadyAssetReference } from '../normalize/document.js';

export interface ReadyAssetWarning {
  code: 'UNSUPPORTED_VECTOR_NETWORK' | 'EMPTY_VECTOR_SUBTREE' | 'READY_ASSET_TOO_LARGE' | 'RENDER_READY_ASSET_FAILED';
  nodeId: string;
  message: string;
}

export interface ReadyAssetRenderResult {
  readyAssets: BundleReadyAsset[];
  readyAssetRefs: Record<string, ReadyAssetReference>;
  warnings: ReadyAssetWarning[];
}
