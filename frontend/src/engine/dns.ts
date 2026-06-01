import type { DeviceState, PacketState, SimulationState, DnsPayload } from './types';
import type { Transmission } from './arp';
import { getPrimaryInterface, getArpEntry, getDeviceConnections, createArpRequest } from './arp';
import { nanoid } from './nanoid';
import { isSameSubnet } from './routing';

export function createDnsQuery(device: DeviceState, dnsServerIp: string, hostname: string): PacketState {
  const iface = getPrimaryInterface(device);
  const txId = Math.floor(Math.random() * 0xffff);
  const dns: DnsPayload = { messageType: 'query', transactionId: txId, hostname };
  return {
    id: nanoid(),
    layer2: { srcMac: iface.mac, destMac: '00:00:00:00:00:00', etherType: 'ipv4' },
    layer3: { srcIp: iface.ip ?? '', destIp: dnsServerIp, protocol: 'udp', ttl: 64 },
    layer4And7: { srcPort: 1024 + Math.floor(Math.random() * 60000), destPort: 53, protocol: 'dns', payload: '', dns },
    status: 'in-transit',
    currentDeviceId: device.id,
    path: [device.id],
    createdAt: Date.now(),
  };
}

export function startDnsQuery(
  device: DeviceState,
  dnsServerIp: string,
  hostname: string,
  simState: SimulationState
): Transmission[] {
  const iface = getPrimaryInterface(device);
  if (!iface?.ip) return [];

  const resolveIp = (iface.subnet && isSameSubnet(iface.ip, iface.subnet, dnsServerIp))
    ? dnsServerIp
    : iface.gateway ?? dnsServerIp;

  const arpEntry = getArpEntry(device, resolveIp);
  const query = createDnsQuery(device, dnsServerIp, hostname);

  if (!arpEntry) {
    if (!device.pendingArp[resolveIp]) device.pendingArp[resolveIp] = [];
    device.pendingArp[resolveIp].push(query);
    const arpReq = createArpRequest(device, resolveIp);
    return getDeviceConnections(device.id, simState).map(c => ({
      packet: arpReq, fromDeviceId: device.id, toDeviceId: c.otherDeviceId, connectionId: c.id,
    }));
  }

  query.layer2.destMac = arpEntry.mac;
  const conns = getDeviceConnections(device.id, simState);
  const first = conns[0];
  if (!first) return [];
  return [{ packet: query, fromDeviceId: device.id, toDeviceId: first.otherDeviceId, connectionId: first.id }];
}

export function processDnsAtServer(
  packet: PacketState,
  server: DeviceState,
  simState: SimulationState
): Transmission[] {
  const dns = packet.layer4And7?.dns;
  if (!dns || dns.messageType !== 'query') return [];
  if (!server.serviceState?.dns) return [];

  const records = server.serviceState.dns.records;
  const resolvedIp = records[dns.hostname] ?? records[dns.hostname + '.'];

  const iface = getPrimaryInterface(server);
  const response: PacketState = {
    id: nanoid(),
    layer2: { srcMac: iface.mac, destMac: packet.layer2.srcMac, etherType: 'ipv4' },
    layer3: { srcIp: iface.ip ?? '', destIp: packet.layer3?.srcIp ?? '', protocol: 'udp', ttl: 64 },
    layer4And7: {
      srcPort: 53,
      destPort: packet.layer4And7?.srcPort,
      protocol: 'dns',
      payload: '',
      dns: {
        messageType: 'response',
        transactionId: dns.transactionId,
        hostname: dns.hostname,
        resolvedIp: resolvedIp ?? undefined,
      },
    },
    status: 'in-transit',
    currentDeviceId: server.id,
    path: [server.id],
    createdAt: Date.now(),
  };

  const conns = getDeviceConnections(server.id, simState);
  return conns.map(c => ({ packet: response, fromDeviceId: server.id, toDeviceId: c.otherDeviceId, connectionId: c.id }));
}
