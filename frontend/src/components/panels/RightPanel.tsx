import * as Tabs from '@radix-ui/react-tabs';

export default function RightPanel() {
  return (
    <aside className="w-64 bg-gray-900 border-l border-gray-700 flex flex-col shrink-0">
      <Tabs.Root defaultValue="inspector" className="flex flex-col h-full">
        <Tabs.List className="flex border-b border-gray-700 shrink-0">
          {(['inspector', 'terminal', 'config'] as const).map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="flex-1 py-2 text-xs text-gray-400 data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-400 transition-colors hover:text-gray-200"
            >
              {tab === 'inspector' ? 'OSI-Inspektor' : tab === 'terminal' ? 'Terminal' : 'Konfiguration'}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="inspector" className="flex-1 p-3 overflow-y-auto">
          <p className="text-xs text-gray-500 text-center mt-8">
            Kein Paket ausgewählt.
            <br />
            Starte die Simulation und klicke ein Paket an.
          </p>
        </Tabs.Content>

        <Tabs.Content value="terminal" className="flex-1 p-3">
          <p className="text-xs text-gray-500 text-center mt-8">
            Kein Gerät ausgewählt.
            <br />
            Doppelklicke im Simulationsmodus auf ein Gerät.
          </p>
        </Tabs.Content>

        <Tabs.Content value="config" className="flex-1 p-3">
          <p className="text-xs text-gray-500 text-center mt-8">
            Kein Gerät ausgewählt.
            <br />
            Klicke auf ein Gerät im Konstruktionsmodus.
          </p>
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
