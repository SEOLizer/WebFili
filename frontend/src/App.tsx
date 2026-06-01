import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Toolbar from './components/layout/Toolbar';
import StatusBar from './components/layout/StatusBar';
import Toolbox from './components/canvas/Toolbox';
import Canvas from './components/canvas/Canvas';
import RightPanel from './components/panels/RightPanel';
import { useTopologyStore } from './stores/topologyStore';
import { useSimulationUiStore } from './stores/simulationUiStore';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__topoStore = useTopologyStore;
  (window as unknown as Record<string, unknown>).__simUiStore = useSimulationUiStore;
  import('./simulation/simState').then(m => {
    (window as unknown as Record<string, unknown>).__simState = m.simState;
  });
}

function AppInner() {
  const loadFromLocalStorage = useTopologyStore((s) => s.loadFromLocalStorage);
  const initFromStorage = useAuthStore((s) => s.initFromStorage);
  const effective = useThemeStore((s) => s.effective);
  useKeyboardShortcuts();

  useEffect(() => {
    initFromStorage();
    loadFromLocalStorage();
  }, [initFromStorage, loadFromLocalStorage]);

  return (
    <div className={`flex flex-col h-full ${effective === 'dark' ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
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
