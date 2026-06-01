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

    // Init service state
    if (d.services) {
      device.serviceState = {};
      if (d.services.dhcp?.enabled) {
        device.serviceState.dhcp = { leases: [], nextOffset: 0, config: d.services.dhcp };
      }
      if (d.services.dns?.enabled) {
        device.serviceState.dns = {
          records: Object.fromEntries((d.services.dns.records ?? []).map(r => [r.hostname, r.ip])),
        };
      }
      if (d.services.http?.enabled) {
        device.serviceState.http = { html: d.services.http.html ?? '<h1>WebFilius</h1>' };
      }
    }

    simState.devices[node.id] = device;
  }

  for (const edge of edges) {
    simState.connections[edge.id] = {
      id: edge.id,
      sourceDeviceId: edge.source,
      targetDeviceId: edge.target,
    };
  }

  // Map router interfaces to connections
  for (const node of nodes) {
    if (node.data.deviceType !== 'router') continue;
    const device = simState.devices[node.id];
    const routerEdges = edges.filter(e => e.source === node.id || e.target === node.id);
    const ifaceIds = Object.keys(device.interfaces);
    routerEdges.forEach((edge, i) => {
      if (ifaceIds[i]) device.interfaces[ifaceIds[i]].connectedTo = edge.id;
    });
  }
}
