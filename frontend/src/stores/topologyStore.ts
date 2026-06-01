import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  addEdge,
} from '@xyflow/react';
import type { DeviceType, RouteEntry } from '../engine/types';
import type { ServiceConfig } from '../engine/service-config';
import { api } from '../lib/api';

export interface DeviceNodeData extends Record<string, unknown> {
  label: string;
  deviceType: DeviceType;
  interfaces: Record<string, { ip?: string; subnet?: string; mac: string; gateway?: string }>;
  routingTable?: RouteEntry[];
  services?: ServiceConfig;
}

export type DeviceNode = Node<DeviceNodeData>;

interface HistoryEntry {
  nodes: DeviceNode[];
  edges: Edge[];
}

interface TopologyStore {
  nodes: DeviceNode[];
  edges: Edge[];
  history: HistoryEntry[];
  historyIndex: number;
  deviceCounter: Record<DeviceType, number>;
  projectName: string;
  cloudProjectId: number | null;
  isDirty: boolean;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addDevice: (type: DeviceType, position: { x: number; y: number }) => void;
  removeDevice: (nodeId: string) => void;
  renameDevice: (nodeId: string, label: string) => void;
  updateDeviceInterface: (nodeId: string, ifaceId: string, ip: string, subnet: string, gateway?: string) => void;
  updateRoutingTable: (nodeId: string, routes: RouteEntry[]) => void;
  updateServices: (nodeId: string, services: ServiceConfig) => void;
  undo: () => void;
  redo: () => void;
  setProjectName: (name: string) => void;
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => void;
  saveToCloud: () => Promise<void>;
  loadProjectFromCloud: (id: number) => Promise<void>;
  newProject: () => void;
}

const LABELS: Record<DeviceType, string> = {
  pc: 'PC',
  server: 'Server',
  switch: 'SW',
  router: 'R',
  'wan-cloud': 'WAN',
};

const MAC_CHARS = '0123456789ABCDEF';
function randomMac(): string {
  return Array.from({ length: 6 }, () =>
    Array.from({ length: 2 }, () => MAC_CHARS[Math.floor(Math.random() * 16)]).join('')
  ).join(':');
}

const STORAGE_KEY = 'webfili-topology';

export const useTopologyStore = create<TopologyStore>()(
  subscribeWithSelector((set, get) => ({
    nodes: [],
    edges: [],
    history: [],
    historyIndex: -1,
    deviceCounter: { pc: 0, server: 0, switch: 0, router: 0, 'wan-cloud': 0 },
    projectName: 'Mein Projekt',
    cloudProjectId: null,
    isDirty: false,

    onNodesChange: (changes) => {
      const next = applyNodeChanges(changes, get().nodes) as DeviceNode[];
      set({ nodes: next, isDirty: true });
      get().saveToLocalStorage();
    },

    onEdgesChange: (changes) => {
      const next = applyEdgeChanges(changes, get().edges);
      set({ edges: next, isDirty: true });
      get().saveToLocalStorage();
    },

    onConnect: (connection) => {
      let { nodes } = get();
      // Auto-create a new interface on routers when a new connection is made
      [connection.source, connection.target].forEach((nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node || node.data.deviceType !== 'router') return;
        const ifaceCount = Object.keys(node.data.interfaces).length;
        const newIfaceId = `eth${ifaceCount}`;
        if (!node.data.interfaces[newIfaceId]) {
          nodes = nodes.map(n =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, interfaces: { ...n.data.interfaces, [newIfaceId]: { mac: randomMac() } } } }
              : n
          );
        }
      });
      const next = addEdge({ ...connection, animated: false }, get().edges);
      set({ nodes, edges: next, isDirty: true });
      get().saveToLocalStorage();
    },

    addDevice: (type, position) => {
      const { nodes, edges, deviceCounter } = get();
      const newCounter = { ...deviceCounter, [type]: deviceCounter[type] + 1 };
      const count = newCounter[type];
      const label = `${LABELS[type]}-${count}`;
      const id = `${type}-${Date.now()}`;

      const newNode: DeviceNode = {
        id,
        type: `${type}Node`,
        position: {
          x: Math.round(position.x / 20) * 20,
          y: Math.round(position.y / 20) * 20,
        },
        data: {
          label,
          deviceType: type,
          interfaces: {
            eth0: { mac: randomMac() },
          },
        },
      };

      const snapshot: HistoryEntry = { nodes, edges };
      const { history, historyIndex } = get();
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(snapshot);

      set({
        nodes: [...nodes, newNode],
        deviceCounter: newCounter,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        isDirty: true,
      });
      get().saveToLocalStorage();
    },

    removeDevice: (nodeId) => {
      const { nodes, edges } = get();
      set({
        nodes: nodes.filter((n) => n.id !== nodeId),
        edges: edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
        isDirty: true,
      });
      get().saveToLocalStorage();
    },

    renameDevice: (nodeId, label) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
        ),
        isDirty: true,
      }));
      get().saveToLocalStorage();
    },

    updateDeviceInterface: (nodeId, ifaceId, ip, subnet, gateway) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  interfaces: {
                    ...n.data.interfaces,
                    [ifaceId]: { ...n.data.interfaces[ifaceId], ip, subnet, ...(gateway !== undefined ? { gateway } : {}) },
                  },
                },
              }
            : n
        ),
        isDirty: true,
      }));
      get().saveToLocalStorage();
    },

    updateRoutingTable: (nodeId, routes) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, routingTable: routes } } : n
        ),
        isDirty: true,
      }));
      get().saveToLocalStorage();
    },

    updateServices: (nodeId, services) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, services } } : n
        ),
        isDirty: true,
      }));
      get().saveToLocalStorage();
    },

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex < 0) return;
      const entry = history[historyIndex];
      set({ nodes: entry.nodes, edges: entry.edges, historyIndex: historyIndex - 1, isDirty: true });
      get().saveToLocalStorage();
    },

    redo: () => {
      const { history, historyIndex, nodes, edges } = get();
      if (historyIndex >= history.length - 1) return;
      const snapshot: HistoryEntry = { nodes, edges };
      const newHistory = [...history.slice(0, historyIndex + 1), snapshot];
      const entry = history[historyIndex + 1];
      set({ nodes: entry.nodes, edges: entry.edges, history: newHistory, historyIndex: historyIndex + 1, isDirty: true });
      get().saveToLocalStorage();
    },

    setProjectName: (name) => set({ projectName: name, isDirty: true }),

    saveToLocalStorage: () => {
      const { nodes, edges, deviceCounter, projectName, cloudProjectId } = get();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges, deviceCounter, projectName, cloudProjectId }));
    },

    loadFromLocalStorage: () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const { nodes, edges, deviceCounter, projectName, cloudProjectId } = JSON.parse(raw);
        set({ nodes, edges, deviceCounter, projectName: projectName ?? 'Mein Projekt', cloudProjectId: cloudProjectId ?? null, isDirty: false });
      } catch {
        // corrupt storage – ignore
      }
    },

    saveToCloud: async () => {
      const { nodes, edges, projectName, cloudProjectId } = get();
      const topology = { nodes, edges };
      let result: { id: number; name: string };
      if (cloudProjectId) {
        result = await api.put<{ id: number; name: string }>(`/api/projects/${cloudProjectId}`, { name: projectName, topology });
      } else {
        result = await api.post<{ id: number; name: string }>('/api/projects', { name: projectName, topology });
      }
      set({ cloudProjectId: result.id, isDirty: false });
      get().saveToLocalStorage();
    },

    loadProjectFromCloud: async (id) => {
      const result = await api.get<{ id: number; name: string; topology: { nodes: DeviceNode[]; edges: Edge[] } }>(`/api/projects/${id}`);
      const { nodes, edges } = result.topology ?? { nodes: [], edges: [] };
      set({
        nodes,
        edges,
        projectName: result.name,
        cloudProjectId: result.id,
        history: [],
        historyIndex: -1,
        isDirty: false,
      });
      get().saveToLocalStorage();
    },

    newProject: () => {
      set({
        nodes: [],
        edges: [],
        history: [],
        historyIndex: -1,
        deviceCounter: { pc: 0, server: 0, switch: 0, router: 0, 'wan-cloud': 0 },
        projectName: 'Mein Projekt',
        cloudProjectId: null,
        isDirty: false,
      });
      localStorage.removeItem(STORAGE_KEY);
    },
  }))
);
