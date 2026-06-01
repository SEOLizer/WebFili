import * as Tabs from '@radix-ui/react-tabs';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import OsiInspector from './OsiInspector';
import FakeTerminal from './FakeTerminal';
import DeviceConfig from './DeviceConfig';

export default function RightPanel() {
  const mode = useSimulationUiStore((s) => s.mode);
  const defaultTab = mode === 'simulate' ? 'terminal' : 'config';

  return (
    <aside className="w-72 bg-gray-900 border-l border-gray-700 flex flex-col shrink-0">
      <Tabs.Root defaultValue={defaultTab} key={mode} className="flex flex-col h-full">
        <Tabs.List className="flex border-b border-gray-700 shrink-0">
          {(['inspector', 'terminal', 'config'] as const).map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="flex-1 py-2 text-[11px] text-gray-400 data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-400 transition-colors hover:text-gray-200"
            >
              {tab === 'inspector' ? 'OSI-Inspektor' : tab === 'terminal' ? 'Terminal' : 'Konfiguration'}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="inspector" className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <OsiInspector />
        </Tabs.Content>

        <Tabs.Content value="terminal" className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <FakeTerminal />
        </Tabs.Content>

        <Tabs.Content value="config" className="flex-1 overflow-y-auto">
          <DeviceConfig />
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
