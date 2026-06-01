export type DeviceType = 'pc' | 'server' | 'switch' | 'router' | 'wan-cloud';

export interface InterfaceState {
  id: string;
  ip?: string;
  subnet?: string;
  mac: string;
  gateway?: string;
  connectedTo?: string;
}

export interface ArpEntry {
  ip: string;
  mac: string;
  interfaceId: string;
  expiresAt: number;
}

export interface MacEntry {
  mac: string;
  connectionId: string;
  learnedAt: number;
}

export interface RouteEntry {
  network: string;
  subnet: string;
  nextHop?: string;
  interfaceId: string;
  metric: number;
}

export interface ServiceState {
  type: 'dhcp' | 'dns' | 'http';
  running: boolean;
  config: Record<string, unknown>;
}

export interface ArpPayload {
  operation: 'request' | 'reply';
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
}

export interface DhcpPayload {
  messageType: 'discover' | 'offer' | 'request' | 'ack' | 'nak';
  clientMac: string;
  transactionId: number;
  offeredIp?: string;
  requestedIp?: string;
  serverIp?: string;
  subnetMask?: string;
  gateway?: string;
  dnsServer?: string;
  leaseTime?: number;
}

export interface DnsPayload {
  messageType: 'query' | 'response';
  transactionId: number;
  hostname: string;
  resolvedIp?: string;
}

export interface HttpPayload {
  method?: 'GET' | 'POST';
  path?: string;
  host?: string;
  statusCode?: number;
  statusText?: string;
  body?: string;
  contentType?: string;
}

export interface PacketState {
  id: string;
  layer2: {
    srcMac: string;
    destMac: string;
    etherType: 'ipv4' | 'arp';
    arp?: ArpPayload;
  };
  layer3?: {
    srcIp: string;
    destIp: string;
    protocol: 'icmp' | 'tcp' | 'udp';
    ttl: number;
  };
  layer4And7?: {
    srcPort?: number;
    destPort?: number;
    protocol: 'http' | 'dns' | 'dhcp' | 'icmp';
    payload: string;
    icmpType?: 'echo-request' | 'echo-reply' | 'ttl-exceeded' | 'unreachable';
    icmpSeq?: number;
    icmpOriginalTtl?: number;
    dhcp?: DhcpPayload;
    dns?: DnsPayload;
    http?: HttpPayload;
  };
  status: 'queued' | 'in-transit' | 'received' | 'dropped';
  currentDeviceId: string;
  path: string[];
  dropReason?: string;
  createdAt: number;
}

export interface DhcpLease {
  ip: string;
  mac: string;
  expiresAt: number;
}

export interface DeviceServiceState {
  dhcp?: { leases: DhcpLease[]; nextOffset: number; config: import('./service-config').DhcpServiceConfig };
  dns?: { records: Record<string, string> };
  http?: { html: string };
}

export interface DeviceState {
  id: string;
  type: DeviceType;
  label: string;
  interfaces: Record<string, InterfaceState>;
  arpTable: ArpEntry[];
  macTable: MacEntry[];
  routingTable: RouteEntry[];
  services: ServiceState[];
  outgoingQueue: PacketState[];
  pendingArp: Record<string, PacketState[]>;
  serviceState?: DeviceServiceState;
}

export interface ConnectionState {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
}

export interface SimulationState {
  devices: Record<string, DeviceState>;
  connections: Record<string, ConnectionState>;
  packets: PacketState[];
}

export interface TransitPacket {
  id: string;
  packet: PacketState;
  fromDeviceId: string;
  toDeviceId: string;
  connectionId: string;
  incomingConnectionId: string | null;
  progress: number;
  durationMs: number;
}
