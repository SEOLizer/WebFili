import * as Tabs from '@radix-ui/react-tabs';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import { useAuthStore } from '../../stores/authStore';
import OsiInspector from './OsiInspector';
import XtermTerminal from './XtermTerminal';
import DeviceConfig from './DeviceConfig';
import ServiceManager from './ServiceManager';
import TeacherDashboard from './TeacherDashboard';

export default function RightPanel() {
  const mode = useSimulationUiStore(s => s.mode);
  const user = useAuthStore(s => s.user);
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  const defaultTab = mode === 'simulate' ? 'terminal' : 'config';

  const tabs = ['inspector', 'terminal', 'config', 'services', ...(isTeacher ? ['lehrer'] : [])] as const;
  const labels: Record<string, string> = {
    inspector: 'OSI',
    terminal: 'Terminal',
    config: 'IP-Config',
    services: 'Dienste',
    lehrer: 'Lehrer',
  };

  return (
    <aside className="w-80 bg-gray-900 border-l border-gray-700 flex flex-col shrink-0">
      <Tabs.Root defaultValue={defaultTab} key={mode + String(isTeacher)} className="flex flex-col h-full">
        <Tabs.List className="flex border-b border-gray-700 shrink-0 overflow-x-auto">
          {tabs.map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="flex-1 py-2 text-[10px] text-gray-400 data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-400 transition-colors hover:text-gray-200 whitespace-nowrap px-1"
            >
              {labels[tab]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="inspector" className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <OsiInspector />
        </Tabs.Content>

        <Tabs.Content value="terminal" className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <XtermTerminal />
        </Tabs.Content>

        <Tabs.Content value="config" className="flex-1 overflow-y-auto">
          <DeviceConfig />
        </Tabs.Content>

        <Tabs.Content value="services" className="flex-1 overflow-y-auto">
          <ServiceManager />
        </Tabs.Content>

        {isTeacher && (
          <Tabs.Content value="lehrer" className="flex-1 overflow-y-auto">
            <TeacherDashboard />
          </Tabs.Content>
        )}
      </Tabs.Root>
    </aside>
  );
}
