import { useState } from 'react';
import { useTopologyStore } from '../../stores/topologyStore';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import type { RouteEntry } from '../../engine/types';

export default function DeviceConfig() {
  const selectedDeviceId = useSimulationUiStore((s) => s.selectedDeviceId);
  const mode = useSimulationUiStore((s) => s.mode);
  const { nodes, edges, updateDeviceInterface, updateRoutingTable } = useTopologyStore();

  const node = nodes.find((n) => n.id === selectedDeviceId);
  if (!node) {
    return (
      <p className="text-xs text-gray-500 text-center mt-8 px-3">
        Kein Gerät ausgewählt.
        <br />
        Klicke auf ein Gerät.
      </p>
    );
  }

  const isRouter = node.data.deviceType === 'router';
  const isSwitch = node.data.deviceType === 'switch' || node.data.deviceType === 'wan-cloud';
  const disabled = mode === 'simulate';

  // For routers: find which device connects to each interface (by edge order)
  const routerEdges = isRouter
    ? edges.filter(e => e.source === node.id || e.target === node.id)
    : [];

  return (
    <div className="p-3 space-y-4 text-xs overflow-y-auto">
      <div>
        <h3 className="font-semibold text-gray-200">{node.data.label}</h3>
        <p className="text-gray-500 capitalize">{node.data.deviceType}</p>
      </div>

      {isSwitch ? (
        <p className="text-gray-500 italic text-[11px]">
          Switches benötigen keine IP-Konfiguration (Layer-2-Gerät).
        </p>
      ) : isRouter ? (
        <>
          <RouterInterfaces
            nodeId={node.id}
            interfaces={node.data.interfaces}
            routerEdges={routerEdges}
            nodes={nodes}
            disabled={disabled}
            onUpdate={updateDeviceInterface}
          />
          <RoutingTableEditor
            nodeId={node.id}
            routes={node.data.routingTable ?? []}
            disabled={disabled}
            onUpdate={updateRoutingTable}
          />
        </>
      ) : (
        <InterfaceEditor
          nodeId={node.id}
          ifaceId="eth0"
          iface={node.data.interfaces['eth0']}
          showGateway
          disabled={disabled}
          onUpdate={updateDeviceInterface}
        />
      )}

      {disabled && (
        <p className="text-amber-500 text-[10px]">
          Gesperrt im Simulationsmodus. Stoppe die Simulation für Änderungen.
        </p>
      )}
    </div>
  );
}

function RouterInterfaces({ nodeId, interfaces, routerEdges, nodes, disabled, onUpdate }: {
  nodeId: string;
  interfaces: Record<string, { ip?: string; subnet?: string; mac: string; gateway?: string }>;
  routerEdges: { source: string; target: string; id: string }[];
  nodes: { id: string; data: { label: string } }[];
  disabled: boolean;
  onUpdate: (nodeId: string, ifaceId: string, ip: string, subnet: string, gateway?: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="font-medium text-gray-300">Interfaces</p>
      {Object.entries(interfaces).map(([ifaceId, iface], i) => {
        const edge = routerEdges[i];
        const peerId = edge ? (edge.source === nodeId ? edge.target : edge.source) : null;
        const peerLabel = peerId ? nodes.find(n => n.id === peerId)?.data.label : null;
        return (
          <div key={ifaceId} className="border border-gray-700 rounded p-2 space-y-1.5">
            <div className="flex justify-between">
              <span className="font-mono text-gray-300">{ifaceId}</span>
              {peerLabel && <span className="text-gray-500 text-[10px]">→ {peerLabel}</span>}
            </div>
            <InterfaceEditor
              nodeId={nodeId}
              ifaceId={ifaceId}
              iface={iface}
              showGateway={false}
              disabled={disabled}
              onUpdate={onUpdate}
            />
          </div>
        );
      })}
    </div>
  );
}

function InterfaceEditor({ nodeId, ifaceId, iface, showGateway, disabled, onUpdate }: {
  nodeId: string;
  ifaceId: string;
  iface: { ip?: string; subnet?: string; mac: string; gateway?: string } | undefined;
  showGateway: boolean;
  disabled: boolean;
  onUpdate: (nodeId: string, ifaceId: string, ip: string, subnet: string, gateway?: string) => void;
}) {
  const [ip, setIp] = useState(iface?.ip ?? '');
  const [subnet, setSubnet] = useState(iface?.subnet ?? '255.255.255.0');
  const [gw, setGw] = useState(iface?.gateway ?? '');

  const save = () => onUpdate(nodeId, ifaceId, ip, subnet, showGateway ? gw : undefined);

  return (
    <div className="space-y-1">
      <Field label="MAC" value={iface?.mac ?? ''} readOnly />
      <EditableField label="IP" value={ip} onChange={setIp} onBlur={save} disabled={disabled} placeholder="192.168.1.1" />
      <EditableField label="Maske" value={subnet} onChange={setSubnet} onBlur={save} disabled={disabled} placeholder="255.255.255.0" />
      {showGateway && (
        <EditableField label="Gateway" value={gw} onChange={setGw} onBlur={save} disabled={disabled} placeholder="192.168.1.254" />
      )}
    </div>
  );
}

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div className="flex justify-between gap-2 items-center">
      <span className="text-gray-500 w-14 shrink-0">{label}</span>
      <input readOnly={readOnly} value={value} className="flex-1 bg-gray-800 text-gray-400 border border-gray-700 rounded px-1.5 py-0.5 font-mono text-[10px] cursor-default" />
    </div>
  );
}

function EditableField({ label, value, onChange, onBlur, disabled, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; onBlur: () => void; disabled: boolean; placeholder?: string;
}) {
  return (
    <div className="flex justify-between gap-2 items-center">
      <span className="text-gray-500 w-14 shrink-0">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 bg-gray-800 text-gray-200 border border-gray-600 rounded px-1.5 py-0.5 font-mono text-[10px] outline-none focus:border-blue-400 disabled:opacity-50"
      />
    </div>
  );
}

function RoutingTableEditor({ nodeId, routes, disabled, onUpdate }: {
  nodeId: string;
  routes: RouteEntry[];
  disabled: boolean;
  onUpdate: (nodeId: string, routes: RouteEntry[]) => void;
}) {
  const [draft, setDraft] = useState({ network: '', subnet: '255.255.255.0', nextHop: '', interfaceId: 'eth0' });

  const addRoute = () => {
    if (!draft.network) return;
    const newRoute: RouteEntry = { ...draft, metric: 1 };
    onUpdate(nodeId, [...routes, newRoute]);
    setDraft({ network: '', subnet: '255.255.255.0', nextHop: '', interfaceId: 'eth0' });
  };

  const removeRoute = (i: number) => {
    onUpdate(nodeId, routes.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      <p className="font-medium text-gray-300">Statische Routen</p>
      {routes.length === 0 && (
        <p className="text-gray-600 text-[10px] italic">Keine statischen Routen konfiguriert.</p>
      )}
      {routes.map((r, i) => (
        <div key={i} className="flex items-center gap-1 text-[10px] font-mono bg-gray-800 rounded px-2 py-1">
          <span className="text-gray-200 flex-1">{r.network}/{r.subnet}</span>
          {r.nextHop && <span className="text-gray-400">via {r.nextHop}</span>}
          <span className="text-gray-500">{r.interfaceId}</span>
          {!disabled && (
            <button onClick={() => removeRoute(i)} className="text-red-400 hover:text-red-300 ml-1">✕</button>
          )}
        </div>
      ))}
      {!disabled && (
        <div className="border border-gray-700 rounded p-2 space-y-1">
          <p className="text-gray-500 text-[10px]">Route hinzufügen</p>
          <div className="flex gap-1">
            <input value={draft.network} onChange={e => setDraft(d => ({ ...d, network: e.target.value }))}
              placeholder="Netz (z.B. 10.0.0.0)" className="flex-1 bg-gray-800 text-gray-200 border border-gray-600 rounded px-1 py-0.5 font-mono text-[10px] outline-none focus:border-blue-400" />
            <input value={draft.subnet} onChange={e => setDraft(d => ({ ...d, subnet: e.target.value }))}
              placeholder="Maske" className="w-28 bg-gray-800 text-gray-200 border border-gray-600 rounded px-1 py-0.5 font-mono text-[10px] outline-none focus:border-blue-400" />
          </div>
          <div className="flex gap-1">
            <input value={draft.nextHop} onChange={e => setDraft(d => ({ ...d, nextHop: e.target.value }))}
              placeholder="Next-Hop (leer = direkt)" className="flex-1 bg-gray-800 text-gray-200 border border-gray-600 rounded px-1 py-0.5 font-mono text-[10px] outline-none focus:border-blue-400" />
            <input value={draft.interfaceId} onChange={e => setDraft(d => ({ ...d, interfaceId: e.target.value }))}
              placeholder="Interface" className="w-14 bg-gray-800 text-gray-200 border border-gray-600 rounded px-1 py-0.5 font-mono text-[10px] outline-none focus:border-blue-400" />
            <button onClick={addRoute} className="bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-0.5 text-[10px]">+</button>
          </div>
        </div>
      )}
    </div>
  );
}
