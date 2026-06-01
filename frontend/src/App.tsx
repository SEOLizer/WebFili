import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Toolbar from './components/layout/Toolbar';
import StatusBar from './components/layout/StatusBar';
import Toolbox from './components/canvas/Toolbox';
import Canvas from './components/canvas/Canvas';
import RightPanel from './components/panels/RightPanel';
import { useTopologyStore } from './stores/topologyStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

if (import.meta.env.DEV) {
  // Expose stores for Playwright testing
  (window as unknown as Record<string, unknown>).__topoStore = useTopologyStore;
}

function AppInner() {
  const loadFromLocalStorage = useTopologyStore((s) => s.loadFromLocalStorage);
  useKeyboardShortcuts();

  useEffect(() => {
    loadFromLocalStorage();
  }, [loadFromLocalStorage]);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      <Toolbar />
      <div className="flex flex-1 min-h-0">
        <Toolbox />
        <Canvas />
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}
