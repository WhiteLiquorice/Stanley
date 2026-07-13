/**
 * autoLayout.ts — arrange ReactFlow nodes into a clean top-to-bottom DAG
 * using the Dagre layout engine. Call handleAutoLayout in Cockpit.tsx.
 */
import Dagre from '@dagrejs/dagre';

interface LayoutNode {
  id: string;
  position: { x: number; y: number };
  [key: string]: unknown;
}

interface LayoutEdge {
  source: string;
  target: string;
  [key: string]: unknown;
}

const NODE_WIDTH  = 280;
const NODE_HEIGHT = 80;

/**
 * Returns a new nodes array with Dagre-computed positions.
 * Pass into setNodes() directly after calling.
 */
export function applyDagreLayout<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[]
): N[] {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40, marginx: 40, marginy: 40 });

  nodes.forEach(n => {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach(e => {
    // Context edges (mission/parameter) still participate in layout
    g.setEdge(e.source, e.target);
  });

  Dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    if (!pos) return n;
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTH  / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}
