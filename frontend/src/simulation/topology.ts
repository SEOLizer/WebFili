import type { DeviceState } from '../engine/types';
import { useTopologyStore } from '../stores/topologyStore';
import { simState } from './simState';
const HOP_DURATION_MS = 300;
export { HOP_DURATION_MS };

export function initSimFromTopology(): void {
  const { nodes, edges } = useTopologyStore.getState();

  simState.devices = {};
  simState.connections = {};
  simState.transitPackets = [];
  simState.packetLog = [];

  // Build devices
  for (const node of nodes) {
    const d = node.data;
    const device: DeviceState = {
      id: node.id,
      type: d.deviceType,
      label: d.label,
      interfaces: Object.fromEntries(
        Object.entries(d.interfaces).map(([k, v]) => [
          k,
          { id: k, mac: v.mac, ip: v.ip, subnet: v.subnet, gateway: v.gateway },
        ])
      ),
      arpTable: [],
      macTable: [],
      routingTable: d.routingTable ? [...d.routingTable] : [],
      services: [],
      outgoingQueue: [],
      pendingArp: {},
    };
    simState.devices[node.id] = device;
  }

  // Build connections
  for (const edge of edges) {
    simState.connections[edge.id] = {
      id: edge.id,
      sourceDeviceId: edge.source,
      targetDeviceId: edge.target,
    };
  }

  // Map router interfaces to their connections (in order of edges)
  for (const node of nodes) {
    if (node.data.deviceType !== 'router') continue;
    const device = simState.devices[node.id];
    const routerEdges = edges.filter(e => e.source === node.id || e.target === node.id);
    const ifaceIds = Object.keys(device.interfaces);

    routerEdges.forEach((edge, i) => {
      const ifaceId = ifaceIds[i];
      if (ifaceId && device.interfaces[ifaceId]) {
        device.interfaces[ifaceId].connectedTo = edge.id;
      }
    });
  }
}
