import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { Plus } from 'lucide-react';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  animated,
}: EdgeProps) {
  const { setNodes, setEdges, getEdge } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edge = getEdge(id);
  const isContextEdge = edge?.data?.kind === 'context';

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation();
    // In a real app, this would open a popover to select a node to insert.
    // For now, it just adds a dummy node and splits the edge.
    const newNodeId = Math.random().toString(36).substring(2, 9);
    
    setNodes((nds) => [
      ...nds,
      {
        id: newNodeId,
        type: 'workflowNode',
        position: { x: labelX, y: labelY },
        data: {
          id: newNodeId,
          type: 'wait',
          label: 'Inserted Wait',
          data: { ms: '1000' }
        },
      },
    ]);

    setEdges((eds) => {
      const filtered = eds.filter((e) => e.id !== id);
      const edgeToReplace = eds.find((e) => e.id === id);
      if (!edgeToReplace) return filtered;

      return [
        ...filtered,
        {
          id: `e-${edgeToReplace.source}-${newNodeId}`,
          source: edgeToReplace.source,
          target: newNodeId,
          type: 'custom',
        },
        {
          id: `e-${newNodeId}-${edgeToReplace.target}`,
          source: newNodeId,
          target: edgeToReplace.target,
          type: 'custom',
        },
      ];
    });
  };

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          strokeWidth: 2,
          stroke: isContextEdge ? '#a855f7' : '#475569',
          strokeDasharray: animated ? '5,5' : 'none',
        }} 
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12,
            pointerEvents: 'all',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px'
          }}
          className="nodrag nopan"
        >
          {label && (
            <div className="bg-slate-800 border border-slate-700 text-slate-300 font-medium px-2 py-0.5 rounded shadow-sm text-[10px] uppercase tracking-wider">
              {label}
            </div>
          )}
          {!isContextEdge && (
            <button
              className="w-6 h-6 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-400 hover:border-blue-400 shadow-sm transition-all hover:scale-110 group"
              onClick={onEdgeClick}
              title="Insert Node"
            >
              <Plus size={14} className="group-hover:rotate-90 transition-transform" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
