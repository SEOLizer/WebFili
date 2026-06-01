import type { DeviceState, PacketState, SimulationState, DhcpPayload } from './types';
import type { Transmission } from './arp';
import { getPrimaryInterface, getDeviceConnections } from './arp';
import { nanoid } from './nanoid';

const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';
const BROADCAST_IP = '255.255.255.255';

export function createDhcpDiscover(device: DeviceState): { packet: PacketState; txId: number } {
  const iface = getPrimaryInterface(device);
  const txId = Math.floor(Math.random() * 0xffffffff);
  const dhcp: DhcpPayload = { messageType: 'discover', clientMac: iface.mac, transactionId: txId };
  const packet: PacketState = {
    id: nanoid(),
    layer2: { srcMac: iface.mac, destMac: BROADCAST_MAC, etherType: 'ipv4' },
    layer3: { srcIp: '0.0.0.0', destIp: BROADCAST_IP, protocol: 'udp', ttl: 64 },
    layer4And7: { srcPort: 68, destPort: 67, protocol: 'dhcp', payload: '', dhcp },
    status: 'in-transit',
    currentDeviceId: device.id,
    path: [device.id],
    createdAt: Date.now(),
  };
  return { packet, txId };
}

export function createDhcpOffer(server: DeviceState, discover: PacketState, offeredIp: string): PacketState {
  const iface = getPrimaryInterface(server);
  const dhcpIn = discover.layer4And7!.dhcp!;
  const cfg = server.serviceState?.dhcp?.config;
  const dhcp: DhcpPayload = {
    messageType: 'offer',
    clientMac: dhcpIn.clientMac,
    transactionId: dhcpIn.transactionId,
    offeredIp,
    serverIp: iface.ip,
    subnetMask: cfg?.subnet ?? '255.255.255.0',
    gateway: cfg?.gateway,
    dnsServer: cfg?.dnsServer,
    leaseTime: cfg?.leaseTime ?? 86400,
  };
  return {
    id: nanoid(),
    layer2: { srcMac: iface.mac, destMac: BROADCAST_MAC, etherType: 'ipv4' },
    layer3: { srcIp: iface.ip ?? '', destIp: BROADCAST_IP, protocol: 'udp', ttl: 64 },
    layer4And7: { srcPort: 67, destPort: 68, protocol: 'dhcp', payload: '', dhcp },
    status: 'in-transit',
    currentDeviceId: server.id,
    path: [server.id],
    createdAt: Date.now(),
  };
}

export function createDhcpRequest(device: DeviceState, offer: PacketState): PacketState {
  const iface = getPrimaryInterface(device);
  const dhcpIn = offer.layer4And7!.dhcp!;
  const dhcp: DhcpPayload = {
    messageType: 'request',
    clientMac: iface.mac,
    transactionId: dhcpIn.transactionId,
    requestedIp: dhcpIn.offeredIp,
    serverIp: dhcpIn.serverIp,
  };
  return {
    id: nanoid(),
    layer2: { srcMac: iface.mac, destMac: BROADCAST_MAC, etherType: 'ipv4' },
    layer3: { srcIp: '0.0.0.0', destIp: BROADCAST_IP, protocol: 'udp', ttl: 64 },
    layer4And7: { srcPort: 68, destPort: 67, protocol: 'dhcp', payload: '', dhcp },
    status: 'in-transit',
    currentDeviceId: device.id,
    path: [device.id],
    createdAt: Date.now(),
  };
}

export function createDhcpAck(server: DeviceState, request: PacketState): PacketState {
  const iface = getPrimaryInterface(server);
  const dhcpIn = request.layer4And7!.dhcp!;
  const cfg = server.serviceState?.dhcp?.config;
  const dhcp: DhcpPayload = {
    messageType: 'ack',
    clientMac: dhcpIn.clientMac,
    transactionId: dhcpIn.transactionId,
    offeredIp: dhcpIn.requestedIp,
    serverIp: iface.ip,
    subnetMask: cfg?.subnet ?? '255.255.255.0',
    gateway: cfg?.gateway,
    dnsServer: cfg?.dnsServer,
    leaseTime: cfg?.leaseTime ?? 86400,
  };
  return {
    id: nanoid(),
    layer2: { srcMac: iface.mac, destMac: BROADCAST_MAC, etherType: 'ipv4' },
    layer3: { srcIp: iface.ip ?? '', destIp: BROADCAST_IP, protocol: 'udp', ttl: 64 },
    layer4And7: { srcPort: 67, destPort: 68, protocol: 'dhcp', payload: '', dhcp },
    status: 'in-transit',
    currentDeviceId: server.id,
    path: [server.id],
    createdAt: Date.now(),
  };
}

export function processDhcpAtServer(
  packet: PacketState,
  server: DeviceState,
  simState: SimulationState
): Transmission[] {
  const dhcp = packet.layer4And7?.dhcp;
  if (!dhcp || server.serviceState?.dhcp === undefined) return [];

  const state = server.serviceState.dhcp;
  const cfg = state.config;
  const conns = getDeviceConnections(server.id, simState);

  if (dhcp.messageType === 'discover') {
    const offeredIp = allocateIp(cfg.rangeStart, state.nextOffset++);
    if (!offeredIp) return [];
    const offer = createDhcpOffer(server, packet, offeredIp);
    return conns.map(c => ({ packet: offer, fromDeviceId: server.id, toDeviceId: c.otherDeviceId, connectionId: c.id }));
  }

  if (dhcp.messageType === 'request') {
    if (dhcp.serverIp !== getPrimaryInterface(server).ip) return [];
    const ack = createDhcpAck(server, packet);
    state.leases.push({ ip: dhcp.requestedIp!, mac: dhcp.clientMac, expiresAt: Date.now() + (cfg.leaseTime ?? 86400) * 1000 });
    return conns.map(c => ({ packet: ack, fromDeviceId: server.id, toDeviceId: c.otherDeviceId, connectionId: c.id }));
  }

  return [];
}

function allocateIp(rangeStart: string, offset: number): string | null {
  const parts = rangeStart.split('.').map(Number);
  const lastOctet = parts[3] + offset;
  if (lastOctet > 254) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.${lastOctet}`;
}

export function startDhcp(device: DeviceState, simState: SimulationState): Transmission[] {
  const { packet } = createDhcpDiscover(device);
  const conns = getDeviceConnections(device.id, simState);
  return conns.map(c => ({ packet, fromDeviceId: device.id, toDeviceId: c.otherDeviceId, connectionId: c.id }));
}

export function processDhcpAtClient(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState
): Transmission[] {
  const dhcp = packet.layer4And7?.dhcp;
  if (!dhcp) return [];

  if (dhcp.messageType === 'offer') {
    const request = createDhcpRequest(device, packet);
    const conns = getDeviceConnections(device.id, simState);
    return conns.map(c => ({ packet: request, fromDeviceId: device.id, toDeviceId: c.otherDeviceId, connectionId: c.id }));
  }

  return [];
}
