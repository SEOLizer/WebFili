import type { DeviceState, PacketState, SimulationState, InterfaceState } from './types';
import { getPrimaryInterface, getArpEntry, createArpRequest, getDeviceConnections } from './arp';
import type { Transmission } from './arp';
import { nanoid } from './nanoid';
import { learnMac, lookupMac } from './mac';
import { isSameSubnet } from './routing';

let icmpSeqCounter = 0;

// ── Ping / Traceroute send from endpoint ─────────────────────────────────────

export function sendPing(
  fromDevice: DeviceState,
  targetIp: string,
  simState: SimulationState,
  ttl = 64
): Transmission[] {
  const iface = getPrimaryInterface(fromDevice);
  if (!iface?.ip) return [];

  const resolveIp = getResolveIp(iface, targetIp);
  if (!resolveIp) return [];

  const arpEntry = getArpEntry(fromDevice, resolveIp);
  const icmpPacket = createIcmpEchoRequest(fromDevice, arpEntry?.mac ?? '00:00:00:00:00:00', iface.ip, targetIp, ttl);

  if (!arpEntry) {
    if (!fromDevice.pendingArp[resolveIp]) fromDevice.pendingArp[resolveIp] = [];
    fromDevice.pendingArp[resolveIp].push(icmpPacket);
    const arpReq = createArpRequest(fromDevice, resolveIp);
    const conns = getDeviceConnections(fromDevice.id, simState);
    return conns.map(c => ({ packet: arpReq, fromDeviceId: fromDevice.id, toDeviceId: c.otherDeviceId, connectionId: c.id }));
  }

  return forwardOut(icmpPacket, fromDevice, arpEntry.mac, simState);
}

function getResolveIp(iface: InterfaceState, targetIp: string): string | null {
  if (!iface.ip || !iface.subnet) return null;
  if (isSameSubnet(iface.ip, iface.subnet, targetIp)) return targetIp;
  return iface.gateway ?? null;
}

function forwardOut(
  packet: PacketState,
  fromDevice: DeviceState,
  destMac: string,
  simState: SimulationState
): Transmission[] {
  const conns = getDeviceConnections(fromDevice.id, simState);
  const destConnId = lookupMac(fromDevice, destMac);
  if (destConnId) {
    const conn = simState.connections[destConnId];
    if (conn) {
      const otherId = conn.sourceDeviceId === fromDevice.id ? conn.targetDeviceId : conn.sourceDeviceId;
      return [{ packet, fromDeviceId: fromDevice.id, toDeviceId: otherId, connectionId: conn.id }];
    }
  }
  const first = conns[0];
  if (!first) return [];
  return [{ packet, fromDeviceId: fromDevice.id, toDeviceId: first.otherDeviceId, connectionId: first.id }];
}

// ── Packet factories ──────────────────────────────────────────────────────────

export function createIcmpEchoRequest(
  fromDevice: DeviceState,
  destMac: string,
  srcIp: string,
  destIp: string,
  ttl = 64
): PacketState {
  return {
    id: nanoid(),
    layer2: { srcMac: getPrimaryInterface(fromDevice).mac, destMac, etherType: 'ipv4' },
    layer3: { srcIp, destIp, protocol: 'icmp', ttl },
    layer4And7: { protocol: 'icmp', payload: '', icmpType: 'echo-request', icmpSeq: ++icmpSeqCounter },
    status: 'in-transit',
    currentDeviceId: fromDevice.id,
    path: [fromDevice.id],
    createdAt: Date.now(),
  };
}

export function createIcmpEchoReply(fromDevice: DeviceState, request: PacketState): PacketState {
  const iface = getPrimaryInterface(fromDevice);
  return {
    id: nanoid(),
    layer2: { srcMac: iface.mac, destMac: request.layer2.srcMac, etherType: 'ipv4' },
    layer3: { srcIp: iface.ip ?? '', destIp: request.layer3?.srcIp ?? '', protocol: 'icmp', ttl: 64 },
    layer4And7: { protocol: 'icmp', payload: '', icmpType: 'echo-reply', icmpSeq: request.layer4And7?.icmpSeq },
    status: 'in-transit',
    currentDeviceId: fromDevice.id,
    path: [fromDevice.id],
    createdAt: Date.now(),
  };
}

export function createTtlExceeded(
  originalPacket: PacketState,
  router: DeviceState,
  incomingConnectionId: string | null,
  simState: SimulationState
): Transmission[] {
  const inIface = incomingConnectionId
    ? Object.values(router.interfaces).find(i => i.connectedTo === incomingConnectionId)
    : getPrimaryInterface(router);
  if (!inIface?.ip) return [];

  const exceeded: PacketState = {
    id: nanoid(),
    layer2: { srcMac: inIface.mac, destMac: originalPacket.layer2.srcMac, etherType: 'ipv4' },
    layer3: { srcIp: inIface.ip, destIp: originalPacket.layer3?.srcIp ?? '', protocol: 'icmp', ttl: 64 },
    layer4And7: {
      protocol: 'icmp',
      payload: '',
      icmpType: 'ttl-exceeded',
      icmpOriginalTtl: originalPacket.layer3?.ttl,
    },
    status: 'in-transit',
    currentDeviceId: router.id,
    path: [router.id],
    createdAt: Date.now(),
  };

  if (!incomingConnectionId) return [];
  const conn = simState.connections[incomingConnectionId];
  if (!conn) return [];
  const otherId = conn.sourceDeviceId === router.id ? conn.targetDeviceId : conn.sourceDeviceId;
  return [{ packet: exceeded, fromDeviceId: router.id, toDeviceId: otherId, connectionId: incomingConnectionId }];
}

// ── Processing at endpoint (PC/Server) ───────────────────────────────────────

export function processIcmpAtEndpoint(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  const iface = getPrimaryInterface(device);
  const destIp = packet.layer3?.destIp;
  if (destIp !== iface?.ip) return [];

  const icmpType = packet.layer4And7?.icmpType;
  if (icmpType !== 'echo-request') return [];

  const reply = createIcmpEchoReply(device, packet);

  // Route reply: if srcIp is in same subnet, reply directly; else use gateway
  const srcIp = packet.layer3?.srcIp ?? '';
  const resolveIp = (iface.subnet && isSameSubnet(iface.ip!, iface.subnet, srcIp))
    ? srcIp
    : iface.gateway ?? srcIp;

  const arpEntry = getArpEntry(device, resolveIp);
  if (arpEntry) {
    reply.layer2.destMac = arpEntry.mac;
    return forwardOut(reply, device, arpEntry.mac, simState);
  }

  // Use srcMac from the incoming packet (we know it from L2)
  reply.layer2.destMac = packet.layer2.srcMac;
  if (incomingConnectionId) {
    const conn = simState.connections[incomingConnectionId];
    if (conn) {
      const otherId = conn.sourceDeviceId === device.id ? conn.targetDeviceId : conn.sourceDeviceId;
      return [{ packet: reply, fromDeviceId: device.id, toDeviceId: otherId, connectionId: incomingConnectionId }];
    }
  }
  return forwardOut(reply, device, packet.layer2.srcMac, simState);
}

// ── Processing at switch (L2 forwarding of IP packets) ───────────────────────

export function processIcmpAtSwitch(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  if (incomingConnectionId) learnMac(device, packet.layer2.srcMac, incomingConnectionId);

  const destMac = packet.layer2.destMac;
  const BROADCAST = 'FF:FF:FF:FF:FF:FF';
  const conns = getDeviceConnections(device.id, simState).filter(c => c.id !== incomingConnectionId);

  if (destMac === BROADCAST) {
    return conns.map(c => ({
      packet: { ...packet, id: nanoid(), path: [...packet.path], status: 'in-transit' as const },
      fromDeviceId: device.id, toDeviceId: c.otherDeviceId, connectionId: c.id,
    }));
  }

  const destConnId = lookupMac(device, destMac);
  if (destConnId && destConnId !== incomingConnectionId) {
    const conn = simState.connections[destConnId];
    if (!conn) return [];
    const otherId = conn.sourceDeviceId === device.id ? conn.targetDeviceId : conn.sourceDeviceId;
    return [{ packet: { ...packet, id: nanoid(), path: [...packet.path], status: 'in-transit' as const }, fromDeviceId: device.id, toDeviceId: otherId, connectionId: destConnId }];
  }

  // Unknown unicast – flood
  return conns.map(c => ({
    packet: { ...packet, id: nanoid(), path: [...packet.path], status: 'in-transit' as const },
    fromDeviceId: device.id, toDeviceId: c.otherDeviceId, connectionId: c.id,
  }));
}
