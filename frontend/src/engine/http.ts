import type { DeviceState, PacketState, SimulationState } from './types';
import type { Transmission } from './arp';
import { getPrimaryInterface, getArpEntry, getDeviceConnections } from './arp';
import { nanoid } from './nanoid';
import { isSameSubnet } from './routing';
import { createArpRequest } from './arp';

export function startHttpGet(
  device: DeviceState,
  serverIp: string,
  host: string,
  path: string,
  simState: SimulationState
): Transmission[] {
  const iface = getPrimaryInterface(device);
  if (!iface?.ip) return [];

  const resolveIp = (iface.subnet && isSameSubnet(iface.ip, iface.subnet, serverIp))
    ? serverIp
    : iface.gateway ?? serverIp;

  const arpEntry = getArpEntry(device, resolveIp);
  const packet = createHttpGetPacket(device, serverIp, host, path, arpEntry?.mac ?? '00:00:00:00:00:00');

  if (!arpEntry) {
    if (!device.pendingArp[resolveIp]) device.pendingArp[resolveIp] = [];
    device.pendingArp[resolveIp].push(packet);
    const arpReq = createArpRequest(device, resolveIp);
    return getDeviceConnections(device.id, simState).map(c => ({
      packet: arpReq, fromDeviceId: device.id, toDeviceId: c.otherDeviceId, connectionId: c.id,
    }));
  }

  const conns = getDeviceConnections(device.id, simState);
  const first = conns[0];
  if (!first) return [];
  return [{ packet, fromDeviceId: device.id, toDeviceId: first.otherDeviceId, connectionId: first.id }];
}

function createHttpGetPacket(
  device: DeviceState,
  serverIp: string,
  host: string,
  path: string,
  destMac: string
): PacketState {
  const iface = getPrimaryInterface(device);
  return {
    id: nanoid(),
    layer2: { srcMac: iface.mac, destMac, etherType: 'ipv4' },
    layer3: { srcIp: iface.ip ?? '', destIp: serverIp, protocol: 'tcp', ttl: 64 },
    layer4And7: {
      srcPort: 1024 + Math.floor(Math.random() * 60000),
      destPort: 80,
      protocol: 'http',
      payload: '',
      http: { method: 'GET', path, host },
    },
    status: 'in-transit',
    currentDeviceId: device.id,
    path: [device.id],
    createdAt: Date.now(),
  };
}

export function processHttpAtServer(
  packet: PacketState,
  server: DeviceState,
  simState: SimulationState
): Transmission[] {
  const http = packet.layer4And7?.http;
  if (!http || http.method !== 'GET') return [];
  if (!server.serviceState?.http) return [];

  const iface = getPrimaryInterface(server);
  const html = server.serviceState.http.html;

  const response: PacketState = {
    id: nanoid(),
    layer2: { srcMac: iface.mac, destMac: packet.layer2.srcMac, etherType: 'ipv4' },
    layer3: { srcIp: iface.ip ?? '', destIp: packet.layer3?.srcIp ?? '', protocol: 'tcp', ttl: 64 },
    layer4And7: {
      srcPort: 80,
      destPort: packet.layer4And7?.srcPort,
      protocol: 'http',
      payload: '',
      http: { statusCode: 200, statusText: 'OK', body: html, contentType: 'text/html' },
    },
    status: 'in-transit',
    currentDeviceId: server.id,
    path: [server.id],
    createdAt: Date.now(),
  };

  const conns = getDeviceConnections(server.id, simState);
  return conns.map(c => ({ packet: response, fromDeviceId: server.id, toDeviceId: c.otherDeviceId, connectionId: c.id }));
}
