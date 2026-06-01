import type { RouteEntry, DeviceState, InterfaceState } from './types';

export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct, 10)) >>> 0, 0) >>> 0;
}

export function subnetToInt(mask: string): number {
  return ipToInt(mask);
}

export function networkAddress(ip: string, mask: string): string {
  const n = (ipToInt(ip) & ipToInt(mask)) >>> 0;
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

export function prefixLength(mask: string): number {
  let bits = ipToInt(mask);
  let count = 0;
  while (bits) { count += bits & 1; bits >>>= 1; }
  return count;
}

export function isInSubnet(ip: string, network: string, mask: string): boolean {
  const m = ipToInt(mask);
  return (ipToInt(ip) & m) >>> 0 === (ipToInt(network) & m) >>> 0;
}

export function isSameSubnet(ip1: string, mask: string, ip2: string): boolean {
  const m = ipToInt(mask);
  return (ipToInt(ip1) & m) >>> 0 === (ipToInt(ip2) & m) >>> 0;
}

export function longestPrefixMatch(routes: RouteEntry[], destIp: string): RouteEntry | undefined {
  let best: RouteEntry | undefined;
  let bestPrefix = -1;
  for (const route of routes) {
    if (isInSubnet(destIp, route.network, route.subnet)) {
      const plen = prefixLength(route.subnet);
      if (plen > bestPrefix) { best = route; bestPrefix = plen; }
    }
  }
  return best;
}

export function buildConnectedRoutes(device: DeviceState): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const iface of Object.values(device.interfaces)) {
    if (iface.ip && iface.subnet) {
      routes.push({
        network: networkAddress(iface.ip, iface.subnet),
        subnet: iface.subnet,
        nextHop: undefined,
        interfaceId: iface.id,
        metric: 0,
      });
    }
  }
  return routes;
}

export function getOutgoingInterface(device: DeviceState, ifaceId: string): InterfaceState | undefined {
  return device.interfaces[ifaceId];
}

export function getInterfaceByConnection(device: DeviceState, connectionId: string): InterfaceState | undefined {
  return Object.values(device.interfaces).find(i => i.connectedTo === connectionId);
}

export function getPrimaryGatewayIp(device: DeviceState): string | undefined {
  return Object.values(device.interfaces)[0]?.gateway;
}
