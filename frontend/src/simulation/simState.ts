import type { SimulationState, TransitPacket, PacketState } from '../engine/types';

interface ExtendedSimState extends SimulationState {
  transitPackets: TransitPacket[];
  packetLog: PacketState[];
}

export const simState: ExtendedSimState = {
  devices: {},
  connections: {},
  packets: [],
  transitPackets: [],
  packetLog: [],
};

export function resetSimState(): void {
  simState.devices = {};
  simState.connections = {};
  simState.packets = [];
  simState.transitPackets = [];
  simState.packetLog = [];
}
