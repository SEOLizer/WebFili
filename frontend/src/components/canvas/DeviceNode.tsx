import { memo, useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { DeviceNodeData } from '../../stores/topologyStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { useSimulationUiStore } from '../../stores/simulationUiStore';

const ICONS: Record<string, string> = {
  pc: '🖥',
  server: '🗄',
  switch: '🔄',
  router: '🌐',
  'wan-cloud': '☁',
};

const BORDER: Record<string, string> = {
  pc: 'border-blue-400',
  server: 'border-purple-400',
  switch: 'border-green-400',
  router: 'border-orange-400',
  'wan-cloud': 'border-cyan-400',
};

type DeviceNodeProps = NodeProps<Node<DeviceNodeData>>;

function DeviceNode({ id, data, selected }: DeviceNodeProps) {
  const d = data as DeviceNodeData;
  const { removeDevice, renameDevice } = useTopologyStore();
  const mode = useSimulationUiStore((s) => s.mode);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.label);

  const commitRename = useCallback(() => {
    setEditing(false);
    if (draft.trim() && draft !== d.label) {
      renameDevice(id, draft.trim());
    }
  }, [draft, d.label, id, renameDevice]);

  const border = BORDER[d.deviceType] ?? 'border-gray-400';

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={`
            relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg
            bg-gray-800 border-2 ${border}
            ${selected ? 'ring-2 ring-white/50' : ''}
            select-none cursor-${mode === 'construct' ? 'grab' : 'default'}
            min-w-[72px]
          `}
          onDoubleClick={() => mode === 'construct' && setEditing(true)}
        >
          <Handle
            type="target"
            position={Position.Top}
            className="!bg-gray-500 !border-gray-300 !w-2 !h-2"
          />

          <span className="text-2xl leading-none">{ICONS[d.deviceType]}</span>

          {editing ? (
            <input
              autoFocus
              className="text-xs text-center bg-gray-700 text-white rounded px-1 w-full outline-none border border-blue-400"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setEditing(false); setDraft(d.label); }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs text-gray-200 font-medium text-center leading-tight">
              {d.label}
            </span>
          )}

          <Handle
            type="source"
            position={Position.Bottom}
            className="!bg-gray-500 !border-gray-300 !w-2 !h-2"
          />
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="bg-gray-800 border border-gray-600 rounded-md shadow-xl py-1 z-50 min-w-[140px]">
          <ContextMenu.Item
            className="px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer outline-none"
            onSelect={() => setEditing(true)}
          >
            Umbenennen
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-gray-600" />
          <ContextMenu.Item
            className="px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 cursor-pointer outline-none"
            onSelect={() => removeDevice(id)}
          >
            Löschen
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export default memo(DeviceNode);
