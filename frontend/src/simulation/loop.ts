import { simState } from './simState';
import { initSimFromTopology, HOP_DURATION_MS } from './topology';
import { processPacketAtDevice } from '../engine/packet';
import type { TransitPacket, PacketState } from '../engine/types';
import type { Transmission } from '../engine/arp';
import { useSimulationUiStore } from '../stores/simulationUiStore';
import { useWanStore } from '../stores/wanStore';
import { nanoid } from '../engine/nanoid';

const SYNC_INTERVAL_MS = 150;

let rafId: number | null = null;
let lastTime = 0;
let lastSync = 0;

export function startSimulation(): void {
  initSimFromTopology();
  setupWanIncomingHandler();
  lastTime = performance.now();
  lastSync = lastTime;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

export function stopSimulation(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function setupWanIncomingHandler(): void {
  useWanStore.getState().setIncomingPacketHandler((nodeId, frame) => {
    const device = simState.devices[nodeId];
    if (!device) return;
    // Inject packet as arriving at the WAN-Cloud node from the remote peer
    const transit: TransitPacket = {
      id: nanoid(),
      packet: { ...frame, status: 'in-transit', currentDeviceId: nodeId },
      fromDeviceId: nodeId,
      toDeviceId: nodeId,
      connectionId: '__wan_incoming__',
      incomingConnectionId: null,
      progress: 1.0,
      durationMs: HOP_DURATION_MS,
    };
    // Find the connection from this WAN-Cloud node outward
    const conn = Object.values(simState.connections).find(
      (c) => c.sourceDeviceId === nodeId || c.targetDeviceId === nodeId
    );
    if (conn) {
      const outDeviceId = conn.sourceDeviceId === nodeId ? conn.targetDeviceId : conn.sourceDeviceId;
      const incomingTransit: TransitPacket = {
        id: nanoid(),
        packet: { ...frame, status: 'in-transit', currentDeviceId: nodeId },
        fromDeviceId: nodeId,
        toDeviceId: outDeviceId,
        connectionId: conn.id,
        incomingConnectionId: null,
        progress: 0,
        durationMs: HOP_DURATION_MS,
      };
      simState.transitPackets.push(incomingTransit);
      logPacket({ ...frame, status: 'in-transit' });
    }
    void transit;
  });
}

function tick(now: number): void {
  const delta = Math.min(now - lastTime, 100);
  lastTime = now;

  advanceTransitPackets(delta);

  if (now - lastSync >= SYNC_INTERVAL_MS) {
    syncToStore();
    lastSync = now;
  }

  if (rafId !== null) {
    rafId = requestAnimationFrame(tick);
  }
}

function advanceTransitPackets(delta: number): void {
  const toDeliver: TransitPacket[] = [];

  for (const tp of simState.transitPackets) {
    tp.progress += delta / tp.durationMs;
    if (tp.progress >= 1.0) {
      tp.progress = 1.0;
      toDeliver.push(tp);
    }
  }

  simState.transitPackets = simState.transitPackets.filter((tp) => tp.progress < 1.0);

  for (const tp of toDeliver) {
    deliverPacket(tp);
  }
}

function deliverPacket(tp: TransitPacket): void {
  const device = simState.devices[tp.toDeviceId];
  if (!device) return;

  tp.packet.currentDeviceId = tp.toDeviceId;
  tp.packet.path.push(tp.toDeviceId);
  tp.packet.status = 'received';

  logPacket({ ...tp.packet });

  const transmissions: Transmission[] = processPacketAtDevice(
    tp.packet,
    device,
    simState,
    tp.incomingConnectionId
  );

  for (const tx of transmissions) {
    if (tx.toDeviceId === '__wan__') {
      // Packet reached a WAN-Cloud node – emit via Socket.io
      useWanStore.getState().emitPacket(tx.fromDeviceId, tx.packet);
    } else {
      enqueueTransit(tx, tp.connectionId);
    }
  }
}

function enqueueTransit(tx: Transmission, incomingConnectionId: string | null): void {
  const transit: TransitPacket = {
    id: nanoid(),
    packet: { ...tx.packet, status: 'in-transit' },
    fromDeviceId: tx.fromDeviceId,
    toDeviceId: tx.toDeviceId,
    connectionId: tx.connectionId,
    incomingConnectionId,
    progress: 0,
    durationMs: HOP_DURATION_MS,
  };
  simState.transitPackets.push(transit);
  logPacket({ ...transit.packet });
}

function logPacket(packet: PacketState): void {
  simState.packetLog.push(packet);
  if (simState.packetLog.length > 500) simState.packetLog.shift();
}

function syncToStore(): void {
  const log = [...simState.packetLog];
  useSimulationUiStore.getState().appendPacketLog(log.slice(-50));
}

export function scheduleTransmission(tx: Transmission): void {
  enqueueTransit(tx, null);
}
