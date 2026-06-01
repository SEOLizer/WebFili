import { useSimulationUiStore } from '../../stores/simulationUiStore';

export default function StatusBar() {
  const { mode, packetLog } = useSimulationUiStore();

  return (
    <footer className="h-7 bg-gray-900 border-t border-gray-700 flex items-center px-3 gap-4 shrink-0 text-xs text-gray-400">
      <span>
        Modus:{' '}
        <span className={mode === 'simulate' ? 'text-green-400' : 'text-gray-300'}>
          {mode === 'construct' ? 'Konstruktion' : 'Simulation'}
        </span>
      </span>
      <span className="h-3 w-px bg-gray-700" />
      <span>Pakete: {packetLog.length}</span>
      <span className="h-3 w-px bg-gray-700" />
      <span>WAN: –</span>
    </footer>
  );
}
