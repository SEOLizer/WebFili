import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  type OnConnectEnd,
  type NodeTypes,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DeviceNode from './DeviceNode';
import WanCloudNode from './WanCloudNode';
import PacketOverlay from './PacketOverlay';
import { useTopologyStore } from '../../stores/topologyStore';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import type { DeviceType } from '../../engine/types';

const nodeTypes: NodeTypes = {
  pcNode: DeviceNode as NodeTypes[string],
  serverNode: DeviceNode as NodeTypes[string],
  switchNode: DeviceNode as NodeTypes[string],
  routerNode: DeviceNode as NodeTypes[string],
  'wan-cloudNode': WanCloudNode as NodeTypes[string],
};

export default function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addDevice } = useTopologyStore();
  const mode = useSimulationUiStore((s) => s.mode);
  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/webfili-device') as DeviceType;
      if (!type) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addDevice(type, position);
    },
    [screenToFlowPosition, addDevice]
  );

  const onConnectEnd: OnConnectEnd = useCallback(() => {}, []);

  return (
    <div ref={wrapperRef} className="flex-1 h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        nodesDraggable={mode === 'construct'}
        edgesReconnectable={mode === 'construct'}
        nodesConnectable={mode === 'construct'}
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Control"
        selectionKeyCode="Shift"
        className="bg-gray-950"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#374151"
        />
        <MiniMap
          className="!bg-gray-800 !border-gray-700"
          nodeColor={(n) => {
            const colors: Record<string, string> = {
              pcNode: '#60a5fa',
              serverNode: '#a78bfa',
              switchNode: '#34d399',
              routerNode: '#fb923c',
              'wan-cloudNode': '#22d3ee',
            };
            return colors[n.type ?? ''] ?? '#6b7280';
          }}
        />
        <Controls className="!bg-gray-800 !border-gray-700 [&>button]:!bg-gray-700 [&>button]:!text-gray-200 [&>button:hover]:!bg-gray-600" />
        <PacketOverlay />
      </ReactFlow>
    </div>
  );
}
