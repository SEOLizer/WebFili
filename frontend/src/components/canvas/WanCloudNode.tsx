import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { DeviceNodeData } from '../../stores/topologyStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import { useWanStore } from '../../stores/wanStore';

type WanCloudNodeProps = NodeProps<Node<DeviceNodeData>>;

function WanCloudNode({ id, data, selected }: WanCloudNodeProps) {
  const d = data as DeviceNodeData;
  const { removeDevice } = useTopologyStore();
  const { mode, setSelectedDevice } = useSimulationUiStore();
  const { joinRoom, leaveRoom, getStatus, nodes: wanNodes } = useWanStore();

  const [tokenInput, setTokenInput] = useState('');
  const [connecting, setConnecting] = useState(false);

  const wanNode = wanNodes[id];
  const status = getStatus(id);

  const statusDot: Record<string, string> = {
    disconnected: '🔴',
    connecting: '🟡',
    connected: '🟢',
    error: '🔴',
  };

  const handleConnect = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    setConnecting(true);
    try {
      await joinRoom(id, token);
    } catch {
      // error set in store
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => leaveRoom(id);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={`
            relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg
            bg-gray-800 border-2 border-cyan-400
            ${selected ? 'ring-2 ring-white/50' : ''}
            select-none cursor-${mode === 'construct' ? 'grab' : 'pointer'}
            min-w-[96px]
          `}
          onClick={() => setSelectedDevice(id)}
        >
          <Handle type="target" position={Position.Top} className="!bg-gray-500 !border-gray-300 !w-2 !h-2" />

          <div className="flex items-center gap-1">
            <span className="text-2xl leading-none">☁</span>
            <span className="text-xs">{statusDot[status]}</span>
          </div>

          <span className="text-xs text-gray-200 font-medium">{d.label}</span>

          {status === 'connected' && wanNode && (
            <span className="text-[9px] text-cyan-400 font-mono">
              {wanNode.peerCount} Verbunden
            </span>
          )}

          {status === 'error' && wanNode?.error && (
            <span className="text-[9px] text-red-400 text-center leading-tight max-w-[90px] truncate" title={wanNode.error}>
              {wanNode.error}
            </span>
          )}

          {/* Token input – only in simulate mode when disconnected */}
          {mode === 'simulate' && status === 'disconnected' && (
            <div className="flex gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                placeholder="Token…"
                className="w-20 text-[9px] bg-gray-700 text-white border border-gray-500 rounded px-1 py-0.5 outline-none focus:border-cyan-400"
              />
              <button
                onClick={handleConnect}
                disabled={connecting || !tokenInput.trim()}
                className="text-[9px] bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white rounded px-1.5 py-0.5"
              >
                {connecting ? '…' : 'OK'}
              </button>
            </div>
          )}

          {mode === 'simulate' && status === 'connected' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}
              className="text-[9px] text-red-400 hover:text-red-300 mt-0.5"
            >
              Trennen
            </button>
          )}

          <Handle type="source" position={Position.Bottom} className="!bg-gray-500 !border-gray-300 !w-2 !h-2" />
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="bg-gray-800 border border-gray-600 rounded-md shadow-xl py-1 z-50 min-w-[140px]">
          {mode === 'construct' && (
            <>
              <ContextMenu.Separator className="my-1 h-px bg-gray-600" />
              <ContextMenu.Item
                className="px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 cursor-pointer outline-none"
                onSelect={() => removeDevice(id)}
              >
                Löschen
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export default memo(WanCloudNode);
