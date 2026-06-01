import type { DeviceState, PacketState, SimulationState } from './types';
import { getPrimaryInterface, getArpEntry, createArpRequest, getDeviceConnections } from './arp';
import type { Transmission } from './arp';
import { nanoid } from './nanoid';
import { learnMac, lookupMac } from './mac';

let icmpSeqCounter = 0;

export function sendPing(
  fromDevice: DeviceState,
  targetIp: string,
  simState: SimulationState
): Transmission[] {
  const iface = getPrimaryInterface(fromDevice);
  if (!iface.ip) return [];

  const arpEntry = getArpEntry(fromDevice, targetIp);

  if (!arpEntry) {
    const arpReq = createArpRequest(fromDevice, targetIp);
    const icmpPacket = createIcmpEchoRequest(fromDevice, '00:00:00:00:00:00', iface.ip, targetIp);
    if (!fromDevice.pendingArp[targetIp]) fromDevice.pendingArp[targetIp] = [];
    fromDevice.pendingArp[targetIp].push(icmpPacket);

    const conns = getDeviceConnections(fromDevice.id, simState);
    return conns.map((c) => ({
      packet: arpReq,
      fromDeviceId: fromDevice.id,
      toDeviceId: c.otherDeviceId,
      connectionId: c.id,
    }));
  }

  const icmpPacket = createIcmpEchoRequest(fromDevice, arpEntry.mac, iface.ip, targetIp);
  return forwardIcmp(icmpPacket, fromDevice, targetIp, arpEntry.mac, simState);
}

function forwardIcmp(
  packet: PacketState,
  fromDevice: DeviceState,
  _targetIp: string,
  destMac: string,
  simState: SimulationState
): Transmission[] {
  const conns = getDeviceConnections(fromDevice.id, simState);
  const destConnId = lookupMac(fromDevice, destMac);
  if (destConnId) {
    const rawConn = simState.connections[destConnId];
    if (!rawConn) return [];
    const otherId = rawConn.sourceDeviceId === fromDevice.id ? rawConn.targetDeviceId : rawConn.sourceDeviceId;
    return [{ packet, fromDeviceId: fromDevice.id, toDeviceId: otherId, connectionId: rawConn.id }];
  }
  const firstConn = conns[0];
  if (!firstConn) return [];
  return [{ packet, fromDeviceId: fromDevice.id, toDeviceId: firstConn.otherDeviceId, connectionId: firstConn.id }];
}

export function createIcmpEchoRequest(
  fromDevice: DeviceState,
  destMac: string,
  srcIp: string,
  destIp: string
): PacketState {
  return {
    id: nanoid(),
    layer2: { srcMac: getPrimaryInterface(fromDevice).mac, destMac, etherType: 'ipv4' },
    layer3: { srcIp, destIp, protocol: 'icmp', ttl: 64 },
    layer4And7: { protocol: 'icmp', payload: '', icmpType: 'echo-request', icmpSeq: ++icmpSeqCounter },
    status: 'in-transit',
    currentDeviceId: fromDevice.id,
    path: [fromDevice.id],
    createdAt: Date.now(),
  };
}

export function createIcmpEchoReply(
  fromDevice: DeviceState,
  request: PacketState
): PacketState {
  const iface = getPrimaryInterface(fromDevice);
  return {
    id: nanoid(),
    layer2: {
      srcMac: iface.mac,
      destMac: request.layer2.srcMac,
      etherType: 'ipv4',
    },
    layer3: {
      srcIp: iface.ip ?? '',
      destIp: request.layer3?.srcIp ?? '',
      protocol: 'icmp',
      ttl: 64,
    },
    layer4And7: {
      protocol: 'icmp',
      payload: '',
      icmpType: 'echo-reply',
      icmpSeq: request.layer4And7?.icmpSeq,
    },
    status: 'in-transit',
    currentDeviceId: fromDevice.id,
    path: [fromDevice.id],
    createdAt: Date.now(),
  };
}

export function processIcmpAtEndpoint(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  const iface = getPrimaryInterface(device);
  const destIp = packet.layer3?.destIp;

  if (destIp !== iface.ip) {
    return [];
  }

  const icmpType = packet.layer4And7?.icmpType;
  if (icmpType === 'echo-request') {
    const reply = createIcmpEchoReply(device, packet);
    const conn = incomingConnectionId
      ? simState.connections[incomingConnectionId]
      : Object.values(simState.connections).find(
          (c) => c.sourceDeviceId === device.id || c.targetDeviceId === device.id
        );
    if (!conn) return [];
    const otherId = conn.sourceDeviceId === device.id ? conn.targetDeviceId : conn.sourceDeviceId;
    return [{ packet: reply, fromDeviceId: device.id, toDeviceId: otherId, connectionId: conn.id }];
  }

  return [];
}

export function processIcmpAtSwitch(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  if (incomingConnectionId) {
    learnMac(device, packet.layer2.srcMac, incomingConnectionId);
  }

  const destMac = packet.layer2.destMac;
  const destConnId = lookupMac(device, destMac);

  const conns = getDeviceConnections(device.id, simState).filter((c) => c.id !== incomingConnectionId);

  if (destConnId && destConnId !== incomingConnectionId) {
    const conn = simState.connections[destConnId];
    if (!conn) return [];
    const otherId = conn.sourceDeviceId === device.id ? conn.targetDeviceId : conn.sourceDeviceId;
    return [{
      packet: { ...packet, id: nanoid(), path: [...packet.path], status: 'in-transit' as const },
      fromDeviceId: device.id,
      toDeviceId: otherId,
      connectionId: destConnId,
    }];
  }

  return conns.map((c) => ({
    packet: { ...packet, id: nanoid(), path: [...packet.path], status: 'in-transit' as const },
    fromDeviceId: device.id,
    toDeviceId: c.otherDeviceId,
    connectionId: c.id,
  }));
}
