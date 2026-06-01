import type { PacketState, DeviceState, SimulationState } from './types';
import type { Transmission } from './arp';
import { processArpAtEndpoint, processArpAtSwitch } from './arp';
import { processIcmpAtEndpoint, processIcmpAtSwitch } from './icmp';

const MAX_PATH_LENGTH = 20;

export function processPacketAtDevice(
  packet: PacketState,
  device: DeviceState,
  simState: SimulationState,
  incomingConnectionId: string | null
): Transmission[] {
  if (packet.path.length >= MAX_PATH_LENGTH) return [];

  if (device.type === 'switch') {
    return processAtSwitch(packet, device, simState, incomingConnectionId);
  }
  return processAtEndpoint(packet, device, simState, incomingConnectionId);
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

  return [];
}

export function getPacketColor(packet: PacketState): string {
  if (packet.layer2.etherType === 'arp') {
    return packet.layer2.arp?.operation === 'reply' ? '#34d399' : '#fbbf24';
  }
  if (packet.layer4And7?.icmpType === 'echo-reply') return '#60a5fa';
  return '#f87171';
}
