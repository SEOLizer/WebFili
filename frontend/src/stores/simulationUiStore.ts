import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { PacketState } from '../engine/types';

export type SimMode = 'construct' | 'simulate';

interface SimulationUiStore {
  mode: SimMode;
  packetLog: PacketState[];
  activePacketId: string | null;
  deviceStats: Record<string, { sent: number; received: number; dropped: number }>;

  setMode: (mode: SimMode) => void;
  setActivePacket: (id: string | null) => void;
  appendPacketLog: (packets: PacketState[]) => void;
  updateDeviceStats: (stats: Record<string, { sent: number; received: number; dropped: number }>) => void;
  clearLog: () => void;
}

export const useSimulationUiStore = create<SimulationUiStore>()(
  subscribeWithSelector((set) => ({
    mode: 'construct',
    packetLog: [],
    activePacketId: null,
    deviceStats: {},

    setMode: (mode) => set({ mode }),
    setActivePacket: (id) => set({ activePacketId: id }),

    appendPacketLog: (packets) =>
      set((state) => ({
        packetLog: [...state.packetLog, ...packets].slice(-500),
      })),

    updateDeviceStats: (stats) => set({ deviceStats: stats }),
    clearLog: () => set({ packetLog: [], activePacketId: null }),
  }))
);
