import { useState } from 'react';
import { useTopologyStore } from '../../stores/topologyStore';
import { useSimulationUiStore } from '../../stores/simulationUiStore';

export default function DeviceConfig() {
  const selectedDeviceId = useSimulationUiStore((s) => s.selectedDeviceId);
  const mode = useSimulationUiStore((s) => s.mode);
  const { nodes, updateDeviceInterface } = useTopologyStore();

  const node = nodes.find((n) => n.id === selectedDeviceId);

  if (!node) {
    return (
      <p className="text-xs text-gray-500 text-center mt-8 px-3">
        Kein Gerät ausgewählt.
        <br />
        Klicke auf ein Gerät im Konstruktionsmodus.
      </p>
    );
  }

  const iface = node.data.interfaces['eth0'];
  const isSwitch = node.data.deviceType === 'switch' || node.data.deviceType === 'wan-cloud';

  return (
    <div className="p-3 space-y-4 text-xs">
      <div>
        <h3 className="font-semibold text-gray-200 mb-1">{node.data.label}</h3>
        <p className="text-gray-500 capitalize">{node.data.deviceType}</p>
      </div>

      {isSwitch ? (
        <div className="text-gray-500 italic">
          {node.data.deviceType === 'switch'
            ? 'Switches benötigen keine IP-Konfiguration (Layer-2-Gerät).'
            : 'WAN-Cloud verbindet Netzwerke über das Internet.'}
        </div>
      ) : (
        <InterfaceEditor
          deviceId={node.id}
          interfaceId="eth0"
          mac={iface?.mac ?? ''}
          ip={iface?.ip ?? ''}
          subnet={iface?.subnet ?? ''}
          disabled={mode === 'simulate'}
          onChange={updateDeviceInterface}
        />
      )}
    </div>
  );
}

function InterfaceEditor({
  deviceId,
  interfaceId,
  mac,
  ip,
  subnet,
  disabled,
  onChange,
}: {
  deviceId: string;
  interfaceId: string;
  mac: string;
  ip: string;
  subnet: string;
  disabled: boolean;
  onChange: (deviceId: string, ifaceId: string, ip: string, subnet: string) => void;
}) {
  const [draftIp, setDraftIp] = useState(ip);
  const [draftSubnet, setDraftSubnet] = useState(subnet || '255.255.255.0');

  const save = () => onChange(deviceId, interfaceId, draftIp, draftSubnet);

  return (
    <div className="space-y-2">
      <p className="font-medium text-gray-300">Interface: {interfaceId}</p>
      <div>
        <label className="text-gray-500 block mb-0.5">MAC-Adresse</label>
        <input
          readOnly
          value={mac}
          className="w-full bg-gray-800 text-gray-400 border border-gray-700 rounded px-2 py-1 font-mono text-[10px] cursor-default"
        />
      </div>
      <div>
        <label className="text-gray-500 block mb-0.5">IP-Adresse</label>
        <input
          value={draftIp}
          onChange={(e) => setDraftIp(e.target.value)}
          onBlur={save}
          disabled={disabled}
          placeholder="192.168.1.1"
          className="w-full bg-gray-800 text-gray-200 border border-gray-600 rounded px-2 py-1 font-mono text-[10px] outline-none focus:border-blue-400 disabled:opacity-50"
        />
      </div>
      <div>
        <label className="text-gray-500 block mb-0.5">Subnetzmaske</label>
        <input
          value={draftSubnet}
          onChange={(e) => setDraftSubnet(e.target.value)}
          onBlur={save}
          disabled={disabled}
          placeholder="255.255.255.0"
          className="w-full bg-gray-800 text-gray-200 border border-gray-600 rounded px-2 py-1 font-mono text-[10px] outline-none focus:border-blue-400 disabled:opacity-50"
        />
      </div>
      {disabled && (
        <p className="text-amber-500 text-[10px]">
          IP-Konfiguration im Simulationsmodus gesperrt. Stoppe die Simulation, um Änderungen vorzunehmen.
        </p>
      )}
    </div>
  );
}
