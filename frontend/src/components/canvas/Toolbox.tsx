import type { DeviceType } from '../../engine/types';
import { useSimulationUiStore } from '../../stores/simulationUiStore';

const DEVICES: { type: DeviceType; icon: string; label: string }[] = [
  { type: 'pc', icon: '🖥', label: 'PC' },
  { type: 'server', icon: '🗄', label: 'Server' },
  { type: 'switch', icon: '🔄', label: 'Switch' },
  { type: 'router', icon: '🌐', label: 'Router' },
  { type: 'wan-cloud', icon: '☁', label: 'WAN-Cloud' },
];

export default function Toolbox() {
  const mode = useSimulationUiStore((s) => s.mode);

  const onDragStart = (e: React.DragEvent, type: DeviceType) => {
    e.dataTransfer.setData('application/webfili-device', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="w-[88px] bg-gray-900 border-r border-gray-700 flex flex-col items-center gap-2 py-4 shrink-0">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Geräte</span>
      {DEVICES.map(({ type, icon, label }) => (
        <div
          key={type}
          draggable={mode === 'construct'}
          onDragStart={(e) => onDragStart(e, type)}
          title={label}
          className={`
            flex flex-col items-center gap-1 px-2 py-2 rounded-lg w-16
            border border-gray-700 bg-gray-800
            ${mode === 'construct'
              ? 'cursor-grab hover:border-gray-500 hover:bg-gray-750 active:cursor-grabbing'
              : 'opacity-40 cursor-not-allowed'}
            transition-colors duration-100 select-none
          `}
        >
          <span className="text-xl">{icon}</span>
          <span className="text-[10px] text-gray-400 leading-tight text-center">{label}</span>
        </div>
      ))}
    </aside>
  );
}
