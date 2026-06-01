import { useSimulationUiStore } from '../../stores/simulationUiStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { startSimulation, stopSimulation } from '../../simulation/loop';

export default function Toolbar() {
  const { mode, setMode, clearLog } = useSimulationUiStore();
  const { undo, redo } = useTopologyStore();

  const toggleMode = () => {
    if (mode === 'construct') {
      setMode('simulate');
      startSimulation();
    } else {
      stopSimulation();
      setMode('construct');
      clearLog();
    }
  };

  return (
    <header className="h-10 bg-gray-900 border-b border-gray-700 flex items-center px-3 gap-4 shrink-0">
      <span className="text-white font-semibold text-sm tracking-tight">WebFilius</span>

      <div className="h-4 w-px bg-gray-700" />

      {mode === 'construct' && (
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            title="Rückgängig (Strg+Z)"
            className="px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors"
          >
            ↩ Rückgängig
          </button>
          <button
            onClick={redo}
            title="Wiederholen (Strg+Y)"
            className="px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors"
          >
            ↪ Wiederholen
          </button>
        </div>
      )}

      <div className="ml-auto">
        <button
          onClick={toggleMode}
          className={`
            px-3 py-1 rounded text-xs font-medium transition-colors
            ${mode === 'construct'
              ? 'bg-green-600 hover:bg-green-500 text-white'
              : 'bg-red-700 hover:bg-red-600 text-white'}
          `}
        >
          {mode === 'construct' ? '▶ Simulation starten' : '⏹ Simulation stoppen'}
        </button>
      </div>
    </header>
  );
}
