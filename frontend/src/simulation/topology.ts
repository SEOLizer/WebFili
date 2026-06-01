import type { DeviceState, ConnectionState } from '../engine/types';
import { useTopologyStore } from '../stores/topologyStore';
import { simState } from './simState';

const HOP_DURATION_MS = 600;

export { HOP_DURATION_MS };

export function initSimFromTopology(): void {
  const { nodes, edges } = useTopologyStore.getState();

  simState.devices = {};
  simState.connections = {};
  simState.transitPackets = [];
  simState.packetLog = [];

  for (const node of nodes) {
    const d = node.data;
    const device: DeviceState = {
      id: node.id,
      type: d.deviceType,
      label: d.label,
      interfaces: Object.fromEntries(
        Object.entries(d.interfaces).map(([k, v]) => [
          k,
          { id: k, mac: v.mac, ip: v.ip, subnet: v.subnet },
        ])
      ),
      arpTable: [],
      macTable: [],
      routingTable: [],
      services: [],
      outgoingQueue: [],
      pendingArp: {},
    };
    simState.devices[node.id] = device;
  }

  for (const edge of edges) {
    const conn: ConnectionState = {
      id: edge.id,
      sourceDeviceId: edge.source,
      targetDeviceId: edge.target,
    };
    simState.connections[edge.id] = conn;
  }
}
