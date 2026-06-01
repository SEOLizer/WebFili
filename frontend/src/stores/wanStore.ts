import { create } from 'zustand';
import { getSocket } from '../lib/socket';
import type { PacketState } from '../engine/types';

export type WanStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WanNodeState {
  token: string;
  status: WanStatus;
  error?: string;
  peerCount: number;
}

interface WanStore {
  nodes: Record<string, WanNodeState>; // nodeId → state
  onIncomingPacket: ((nodeId: string, frame: PacketState) => void) | null;

  setIncomingPacketHandler: (handler: (nodeId: string, frame: PacketState) => void) => void;
  joinRoom: (nodeId: string, token: string) => Promise<void>;
  leaveRoom: (nodeId: string) => void;
  emitPacket: (nodeId: string, frame: PacketState) => void;
  getStatus: (nodeId: string) => WanStatus;
}

export const useWanStore = create<WanStore>((set, get) => ({
  nodes: {},
  onIncomingPacket: null,

  setIncomingPacketHandler: (handler) => set({ onIncomingPacket: handler }),

  joinRoom: async (nodeId, token) => {
    set((s) => ({
      nodes: { ...s.nodes, [nodeId]: { token, status: 'connecting', peerCount: 0 } },
    }));

    const socket = getSocket();
    if (!socket.connected) socket.connect();

    return new Promise((resolve, reject) => {
      socket.emit('join_room', { linkToken: token }, (res: { ok?: boolean; error?: string; peerCount?: number }) => {
        if (res.ok) {
          set((s) => ({
            nodes: {
              ...s.nodes,
              [nodeId]: { token, status: 'connected', peerCount: res.peerCount ?? 1 },
            },
          }));

          // Listen for incoming packets (only set up once per socket)
          socket.off('wan_packet');
          socket.on('wan_packet', ({ frame, sourceNodeId }: { frame: PacketState; sourceNodeId: string }) => {
            // Find the local WAN-Cloud node that uses this token
            const localNodeId = Object.entries(get().nodes).find(
              ([, n]) => n.status === 'connected' && n.token === token
            )?.[0];
            if (localNodeId) {
              get().onIncomingPacket?.(localNodeId, frame);
            }
            void sourceNodeId;
          });

          socket.on('peer_joined', ({ peerCount }: { peerCount: number }) => {
            set((s) => {
              const node = s.nodes[nodeId];
              if (!node) return s;
              return { nodes: { ...s.nodes, [nodeId]: { ...node, peerCount } } };
            });
          });

          resolve();
        } else {
          set((s) => ({
            nodes: {
              ...s.nodes,
              [nodeId]: { token, status: 'error', error: res.error ?? 'Verbindung fehlgeschlagen', peerCount: 0 },
            },
          }));
          reject(new Error(res.error));
        }
      });
    });
  },

  leaveRoom: (nodeId) => {
    const node = get().nodes[nodeId];
    if (!node) return;
    const socket = getSocket();
    socket.emit('leave_room', { linkToken: node.token });
    set((s) => {
      const next = { ...s.nodes };
      delete next[nodeId];
      return { nodes: next };
    });
  },

  emitPacket: (nodeId, frame) => {
    const node = get().nodes[nodeId];
    if (!node || node.status !== 'connected') return;
    const socket = getSocket();
    socket.emit('wan_packet', { linkToken: node.token, frame, sourceNodeId: nodeId });
  },

  getStatus: (nodeId) => get().nodes[nodeId]?.status ?? 'disconnected',
}));
