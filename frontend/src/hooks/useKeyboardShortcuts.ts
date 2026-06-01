import { useEffect, useRef } from 'react';
import { useTopologyStore, type DeviceNode } from '../stores/topologyStore';
import { useSimulationUiStore } from '../stores/simulationUiStore';
import { useAuthStore } from '../stores/authStore';
import type { Edge } from '@xyflow/react';
import { nanoid } from '../engine/nanoid';

export function useKeyboardShortcuts() {
  const { undo, redo, saveToCloud } = useTopologyStore();
  const mode = useSimulationUiStore((s) => s.mode);
  const user = useAuthStore((s) => s.user);
  const clipboard = useRef<{ nodes: DeviceNode[]; edges: Edge[] } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (user) saveToCloud().catch(console.error);
        return;
      }

      if (mode !== 'construct') return;

      if (ctrl && e.key === 'c') {
        const selected = useTopologyStore.getState().nodes.filter((n) => n.selected);
        if (selected.length > 0) {
          const ids = new Set(selected.map((n) => n.id));
          clipboard.current = {
            nodes: selected,
            edges: useTopologyStore.getState().edges.filter(
              (edge) => ids.has(edge.source) && ids.has(edge.target)
            ),
          };
        }
        return;
      }

      if (ctrl && e.key === 'v' && clipboard.current) {
        const idMap: Record<string, string> = {};
        const newNodes: DeviceNode[] = clipboard.current.nodes.map((n) => {
          const newId = `${n.data.deviceType}-${nanoid()}`;
          idMap[n.id] = newId;
          return { ...n, id: newId, selected: true, position: { x: n.position.x + 40, y: n.position.y + 40 } };
        });
        const newEdges: Edge[] = clipboard.current.edges.map((edge) => ({
          ...edge,
          id: `e-${idMap[edge.source]}-${idMap[edge.target]}`,
          source: idMap[edge.source],
          target: idMap[edge.target],
        }));
        useTopologyStore.setState((s) => ({
          nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
          edges: [...s.edges, ...newEdges],
          isDirty: true,
        }));
        useTopologyStore.getState().saveToLocalStorage();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, saveToCloud, mode, user]);
}
