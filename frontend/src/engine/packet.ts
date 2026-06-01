import type { PacketState, DeviceState, SimulationState, InterfaceState } from './types';
import type { Transmission } from './arp';
import { processArpAtEndpoint, processArpAtSwitch, getDeviceConnections } from './arp';
import { processIcmpAtEndpoint, processIcmpAtSwitch, createTtlExceeded } from './icmp';
import { longestPrefixMatch, buildConnectedRoutes } from './routing';
import { learnMac, lookupMac } from './mac';
import { nanoid } from './nanoid';
import { processDhcpAtServer, processDhcpAtClient } from './dhcp';
import { processDnsAtServer } from './dns';
import { processHttpAtServer } from './http';

const MAX_PATH_LENGTH = 30;
const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';

export function processPacketAtDevice(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  if (packet.path.length >= MAX_PATH_LENGTH) return [];

  switch (device.type) {
    case 'switch':
      return processAtSwitch(packet, device, simState, incomingConnectionId);
    case 'router':
      return processAtRouter(packet, device, simState, incomingConnectionId);
    default:
      return processAtEndpoint(packet, device, simState, incomingConnectionId);
  }
}

function processAtSwitch(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  if (packet.layer2.etherType === 'arp') {
    return processArpAtSwitch(packet, device, simState, incomingConnectionId);
  }
  return processIcmpAtSwitch(packet, device, simState, incomingConnectionId);
}

function processAtEndpoint(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  if (packet.layer2.etherType === 'arp') {
    return processArpAtEndpoint(packet, device, simState, incomingConnectionId);
  }
  if (packet.layer3?.protocol === 'icmp') {
    return processIcmpAtEndpoint(packet, device, simState, incomingConnectionId);
  }
  if (packet.layer3?.protocol === 'udp' || packet.layer3?.protocol === 'tcp') {
    return processServicePacket(packet, device, simState);
  }
  return [];
}

function processServicePacket(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState
): Transmission[] {
  const destPort = packet.layer4And7?.destPort;
  const destIp = packet.layer3?.destIp;
  const myIps = Object.values(device.interfaces).map(i => i.ip).filter(Boolean);

  // Only process if packet is addressed to us (or broadcast for DHCP)
  const isBroadcast = destIp === '255.255.255.255';
  if (!isBroadcast && !myIps.includes(destIp)) return [];

  if (destPort === 67 && device.serviceState?.dhcp) {
    return processDhcpAtServer(packet, device, simState);
  }
  if (destPort === 68) {
    return processDhcpAtClient(packet, device, simState);
  }
  if (destPort === 53 && device.serviceState?.dns) {
    return processDnsAtServer(packet, device, simState);
  }
  if (destPort === 80 && device.serviceState?.http) {
    return processHttpAtServer(packet, device, simState);
  }
  return [];
}

function processAtRouter(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  // ARP is handled same as endpoint
  if (packet.layer2.etherType === 'arp') {
    return processArpAtEndpoint(packet, device, simState, incomingConnectionId);
  }

  const destIp = packet.layer3?.destIp;
  if (!destIp) return [];

  // Is the packet addressed to one of our interfaces?
  const ownIface = Object.values(device.interfaces).find(i => i.ip === destIp);
  if (ownIface) {
    return processIcmpAtEndpoint(packet, device, simState, incomingConnectionId);
  }

  // Decrement TTL
  const ttlIn = packet.layer3!.ttl;
  if (ttlIn <= 1) {
    return createTtlExceeded(packet, device, incomingConnectionId, simState);
  }

  // Build effective routing table (connected + static)
  const connectedRoutes = buildConnectedRoutes(device);
  const allRoutes = [...connectedRoutes, ...device.routingTable];
  const route = longestPrefixMatch(allRoutes, destIp);
  if (!route) return [];

  const outIface = device.interfaces[route.interfaceId];
  if (!outIface?.connectedTo) return [];

  const nextHopIp = route.nextHop ?? destIp;
  const arpEntry = device.arpTable.find(e => e.ip === nextHopIp);

  const newPacket: PacketState = {
    ...packet,
    id: nanoid(),
    path: [...packet.path],
    layer2: { ...packet.layer2, srcMac: outIface.mac, destMac: arpEntry?.mac ?? BROADCAST_MAC },
    layer3: { ...packet.layer3!, ttl: ttlIn - 1 },
    status: 'in-transit',
  };

  if (!arpEntry) {
    if (!device.pendingArp[nextHopIp]) device.pendingArp[nextHopIp] = [];
    device.pendingArp[nextHopIp].push(newPacket);
    return sendArpRequestOnInterface(device, outIface, nextHopIp, simState);
  }

  return transmitOnConnection(newPacket, device, outIface.connectedTo, simState);
}

function sendArpRequestOnInterface(
  device: DeviceState,
  iface: InterfaceState,
  targetIp: string,
  simState: SimulationState
): Transmission[] {
  const arpReq: PacketState = {
    id: nanoid(),
    layer2: {
      srcMac: iface.mac,
      destMac: BROADCAST_MAC,
      etherType: 'arp',
      arp: {
        operation: 'request',
        senderMac: iface.mac,
        senderIp: iface.ip ?? '',
        targetMac: '00:00:00:00:00:00',
        targetIp,
      },
    },
    status: 'in-transit',
    currentDeviceId: device.id,
    path: [device.id],
    createdAt: Date.now(),
  };
  if (!iface.connectedTo) return [];
  return transmitOnConnection(arpReq, device, iface.connectedTo, simState);
}

export function transmitOnConnection(
  packet: PacketState,
  fromDevice: DeviceState,
  connectionId: string,
  simState: SimulationState
): Transmission[] {
  const conn = simState.connections[connectionId];
  if (!conn) return [];
  const otherId = conn.sourceDeviceId === fromDevice.id ? conn.targetDeviceId : conn.sourceDeviceId;
  return [{ packet, fromDeviceId: fromDevice.id, toDeviceId: otherId, connectionId }];
}

export function getPacketColor(packet: PacketState): string {
  if (packet.layer2.etherType === 'arp') {
    return packet.layer2.arp?.operation === 'reply' ? '#34d399' : '#fbbf24';
  }
  const t = packet.layer4And7?.icmpType;
  if (t === 'echo-reply') return '#60a5fa';
  if (t === 'ttl-exceeded') return '#f97316';
  if (t === 'unreachable') return '#ef4444';
  return '#f87171';
}

// Re-export for switch ICMP forwarding (unchanged from WP 2)
export { learnMac, lookupMac, getDeviceConnections };
