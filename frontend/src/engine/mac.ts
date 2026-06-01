import type { DeviceState, MacEntry } from './types';

const MAC_TTL_MS = 300_000;

export function learnMac(device: DeviceState, mac: string, connectionId: string): void {
  const existing = device.macTable.findIndex((e) => e.mac === mac);
  const entry: MacEntry = { mac, connectionId, learnedAt: Date.now() };
  if (existing >= 0) {
    device.macTable[existing] = entry;
  } else {
    device.macTable.push(entry);
  }
}

export function lookupMac(device: DeviceState, mac: string): string | undefined {
  const now = Date.now();
  const entry = device.macTable.find(
    (e) => e.mac === mac && now - e.learnedAt < MAC_TTL_MS
  );
  return entry?.connectionId;
}
