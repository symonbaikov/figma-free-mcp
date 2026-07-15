import type { AgentDocument, AgentNode } from '../normalize/document.js';

export function findReadyAssetTargets(document: AgentDocument): AgentNode[] {
  return Object.values(document.nodesById)
    .filter((node) => node.type !== 'TEXT')
    .filter((node) => subtreeHasVisibleVector(document, node))
    .filter((node) => !subtreeHasText(document, node))
    .filter((node) => !vectorOnlyAncestor(document, node))
    .sort((a, b) => a.zIndex - b.zIndex);
}

function vectorOnlyAncestor(document: AgentDocument, node: AgentNode): boolean {
  const parent = node.parentId ? document.nodesById[node.parentId] : undefined;
  return Boolean(parent && parent.type !== 'TEXT' && subtreeHasVisibleVector(document, parent) && !subtreeHasText(document, parent));
}

function subtreeHasVisibleVector(document: AgentDocument, node: AgentNode): boolean {
  if (node.vectorRef && node.visible !== false) return true;
  return node.childIds.some((id) => {
    const child = document.nodesById[id];
    return Boolean(child && subtreeHasVisibleVector(document, child));
  });
}

function subtreeHasText(document: AgentDocument, node: AgentNode): boolean {
  if (node.text !== undefined) return true;
  return node.childIds.some((id) => {
    const child = document.nodesById[id];
    return Boolean(child && subtreeHasText(document, child));
  });
}
