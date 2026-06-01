import type { DeviceState, PacketState, ArpEntry, SimulationState, InterfaceState } from './types';
import { learnMac, lookupMac } from './mac';
import { nanoid } from './nanoid';

const ARP_TTL_MS = 60_000;
export const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';

export function getPrimaryInterface(device: DeviceState): InterfaceState {
  return Object.values(device.interfaces)[0];
}

export function getArpEntry(device: DeviceState, ip: string): ArpEntry | undefined {
  const now = Date.now();
  return device.arpTable.find(e => e.ip === ip && now < e.expiresAt);
}

export function learnArp(device: DeviceState, ip: string, mac: string): void {
  const existing = device.arpTable.findIndex(e => e.ip === ip);
  const entry: ArpEntry = { ip, mac, interfaceId: 'eth0', expiresAt: Date.now() + ARP_TTL_MS };
  if (existing >= 0) device.arpTable[existing] = entry;
  else device.arpTable.push(entry);
}

export function createArpRequest(fromDevice: DeviceState, targetIp: string): PacketState {
  const iface = getPrimaryInterface(fromDevice);
  return {
    id: nanoid(),
    layer2: {
      srcMac: iface.mac,
      destMac: BROADCAST_MAC,
      etherType: 'arp',
      arp: { operation: 'request', senderMac: iface.mac, senderIp: iface.ip ?? '', targetMac: '00:00:00:00:00:00', targetIp },
    },
    status: 'in-transit',
    currentDeviceId: fromDevice.id,
    path: [fromDevice.id],
    createdAt: Date.now(),
  };
}

export function createArpReply(fromDevice: DeviceState, iface: InterfaceState, requesterMac: string, requesterIp: string): PacketState {
  return {
    id: nanoid(),
    layer2: {
      srcMac: iface.mac,
      destMac: requesterMac,
      etherType: 'arp',
      arp: { operation: 'reply', senderMac: iface.mac, senderIp: iface.ip ?? '', targetMac: requesterMac, targetIp: requesterIp },
    },
    status: 'in-transit',
    currentDeviceId: fromDevice.id,
    path: [fromDevice.id],
    createdAt: Date.now(),
  };
}

export interface Transmission {
  packet: PacketState;
  fromDeviceId: string;
  toDeviceId: string;
  connectionId: string;
}

export function processArpAtEndpoint(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  const arp = packet.layer2.arp;
  if (!arp) return [];

  // Learn sender MAC/IP on all matching interfaces
  if (arp.senderIp && arp.senderMac) learnArp(device, arp.senderIp, arp.senderMac);

  if (arp.operation === 'request') {
    // Find the interface that owns this target IP
    const matchIface = Object.values(device.interfaces).find(i => i.ip === arp.targetIp);
    if (!matchIface) return [];

    const reply = createArpReply(device, matchIface, arp.senderMac, arp.senderIp);
    const conn = incomingConnectionId
      ? simState.connections[incomingConnectionId]
      : firstConnectionOf(device.id, simState);
    if (!conn) return [];
    const otherId = conn.sourceDeviceId === device.id ? conn.targetDeviceId : conn.sourceDeviceId;
    return [{ packet: reply, fromDeviceId: device.id, toDeviceId: otherId, connectionId: conn.id }];
  }

  if (arp.operation === 'reply') {
    learnArp(device, arp.senderIp, arp.senderMac);
    const queued = device.pendingArp[arp.senderIp] ?? [];
    delete device.pendingArp[arp.senderIp];
    const out: Transmission[] = [];
    for (const qp of queued) {
      qp.layer2.destMac = arp.senderMac;
      // Forward via the connection the ARP reply came in on (router: outgoing iface)
      const conn = incomingConnectionId
        ? simState.connections[incomingConnectionId]
        : firstConnectionOf(device.id, simState);
      if (conn) {
        const otherId = conn.sourceDeviceId === device.id ? conn.targetDeviceId : conn.sourceDeviceId;
        out.push({ packet: qp, fromDeviceId: device.id, toDeviceId: otherId, connectionId: conn.id });
      }
    }
    return out;
  }

  return [];
}

function firstConnectionOf(deviceId: string, simState: SimulationState) {
  return Object.values(simState.connections).find(
    c => c.sourceDeviceId === deviceId || c.targetDeviceId === deviceId
  );
}

export function processArpAtSwitch(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  const arp = packet.layer2.arp;
  if (!arp) return [];

  if (arp.senderMac && incomingConnectionId) learnMac(device, arp.senderMac, incomingConnectionId);

  const conns = getDeviceConnections(device.id, simState);

  if (packet.layer2.destMac === BROADCAST_MAC || arp.operation === 'request') {
    return conns
      .filter(c => c.id !== incomingConnectionId)
      .map(c => ({
        packet: { ...packet, id: nanoid(), path: [...packet.path], status: 'in-transit' as const },
        fromDeviceId: device.id, toDeviceId: c.otherDeviceId, connectionId: c.id,
      }));
  }

  const destConnId = lookupMac(device, packet.layer2.destMac);
  if (destConnId) {
    const conn = simState.connections[destConnId];
    if (!conn) return [];
    const otherId = conn.sourceDeviceId === device.id ? conn.targetDeviceId : conn.sourceDeviceId;
    return [{ packet: { ...packet, id: nanoid(), path: [...packet.path], status: 'in-transit' as const }, fromDeviceId: device.id, toDeviceId: otherId, connectionId: destConnId }];
  }

  return conns
    .filter(c => c.id !== incomingConnectionId)
    .map(c => ({
      packet: { ...packet, id: nanoid(), path: [...packet.path], status: 'in-transit' as const },
      fromDeviceId: device.id, toDeviceId: c.otherDeviceId, connectionId: c.id,
    }));
}

export function getDeviceConnections(
  deviceId: string,
  simState: SimulationState
): { id: string; otherDeviceId: string }[] {
  return Object.values(simState.connections)
    .filter(c => c.sourceDeviceId === deviceId || c.targetDeviceId === deviceId)
    .map(c => ({ id: c.id, otherDeviceId: c.sourceDeviceId === deviceId ? c.targetDeviceId : c.sourceDeviceId }));
}
