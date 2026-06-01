import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { z } from 'zod';
import { getRedis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../services/token';

const RATE_LIMIT = 50; // packets per second per socket
const RATE_WINDOW_MS = 1000;

const FrameSchema = z.object({
  id: z.string(),
  layer2: z.object({
    srcMac: z.string(),
    destMac: z.string(),
    etherType: z.enum(['ipv4', 'arp']),
    arp: z.object({
      operation: z.enum(['request', 'reply']),
      senderMac: z.string(),
      senderIp: z.string(),
      targetMac: z.string(),
      targetIp: z.string(),
    }).optional(),
  }),
  layer3: z.object({
    srcIp: z.string(),
    destIp: z.string(),
    protocol: z.enum(['icmp', 'tcp', 'udp']),
    ttl: z.number(),
  }).optional(),
  layer4And7: z.object({
    srcPort: z.number().optional(),
    destPort: z.number().optional(),
    protocol: z.enum(['http', 'dns', 'dhcp', 'icmp']),
    payload: z.string(),
    icmpType: z.enum(['echo-request', 'echo-reply', 'ttl-exceeded', 'unreachable']).optional(),
    icmpSeq: z.number().optional(),
  }).optional(),
  status: z.enum(['queued', 'in-transit', 'received', 'dropped']),
  currentDeviceId: z.string(),
  path: z.array(z.string()),
  createdAt: z.number(),
});

const JoinRoomSchema = z.object({
  linkToken: z.string().min(1).max(64),
  accessToken: z.string().optional(),
});

const WanPacketSchema = z.object({
  linkToken: z.string().min(1).max(64),
  frame: FrameSchema,
  sourceNodeId: z.string(),
});

interface RateState {
  count: number;
  windowStart: number;
}

export function initSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Attach Redis adapter if available
  const redis = getRedis();
  if (redis) {
    try {
      const pubClient = redis.duplicate();
      const subClient = redis.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      console.log('Socket.io: Redis-Adapter aktiv');
    } catch {
      console.warn('Socket.io: Redis-Adapter nicht verfügbar, In-Memory-Fallback');
    }
  }

  const rateMap = new Map<string, RateState>();

  io.on('connection', (socket) => {
    const joinedRooms = new Set<string>();

    function checkRateLimit(): boolean {
      const now = Date.now();
      const state = rateMap.get(socket.id) ?? { count: 0, windowStart: now };
      if (now - state.windowStart >= RATE_WINDOW_MS) {
        state.count = 1;
        state.windowStart = now;
      } else {
        state.count++;
      }
      rateMap.set(socket.id, state);
      return state.count <= RATE_LIMIT;
    }

    socket.on('join_room', async (data: unknown, ack?: (res: unknown) => void) => {
      const parsed = JoinRoomSchema.safeParse(data);
      if (!parsed.success) {
        ack?.({ error: 'Ungültige Anfrage' });
        return;
      }

      const { linkToken } = parsed.data;

      const link = await prisma.virtualLink.findUnique({
        where: { linkToken },
        include: { creator: { select: { username: true } } },
      });

      if (!link) {
        ack?.({ error: 'Link-Token ungültig oder abgelaufen' });
        return;
      }

      if (link.expiresAt && link.expiresAt < new Date()) {
        ack?.({ error: 'Link-Token abgelaufen' });
        return;
      }

      const room = link.roomName;
      const roomSockets = await io.in(room).fetchSockets();
      if (roomSockets.length >= link.maxUsers) {
        ack?.({ error: 'Raum ist voll' });
        return;
      }

      await socket.join(room);
      joinedRooms.add(linkToken);

      const peerCount = (await io.in(room).fetchSockets()).length;
      ack?.({ ok: true, roomName: room, peerCount });

      socket.to(room).emit('peer_joined', { peerCount });
    });

    socket.on('wan_packet', (data: unknown, ack?: (res: unknown) => void) => {
      if (!checkRateLimit()) {
        socket.emit('wan_error', { message: 'Rate-Limit überschritten (max 50 Pakete/s)' });
        ack?.({ error: 'rate_limit' });
        return;
      }

      const parsed = WanPacketSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('wan_error', { message: 'Ungültiges Frame-Format' });
        ack?.({ error: 'invalid_frame' });
        return;
      }

      const { linkToken, frame, sourceNodeId } = parsed.data;
      if (!joinedRooms.has(linkToken)) {
        socket.emit('wan_error', { message: 'Nicht mit diesem Raum verbunden' });
        return;
      }

      // Relay to all other sockets in room
      prisma.virtualLink.findUnique({ where: { linkToken } }).then((link) => {
        if (!link) return;
        socket.to(link.roomName).emit('wan_packet', { frame, sourceNodeId });
        ack?.({ ok: true, packetId: frame.id });
        socket.emit('wan_ack', { packetId: frame.id });
      }).catch(() => {
        socket.emit('wan_error', { message: 'Interner Fehler' });
      });
    });

    socket.on('leave_room', async (data: unknown) => {
      const parsed = z.object({ linkToken: z.string() }).safeParse(data);
      if (!parsed.success) return;
      const link = await prisma.virtualLink.findUnique({ where: { linkToken: parsed.data.linkToken } });
      if (!link) return;
      await socket.leave(link.roomName);
      joinedRooms.delete(parsed.data.linkToken);
      const peerCount = (await io.in(link.roomName).fetchSockets()).length;
      socket.to(link.roomName).emit('peer_joined', { peerCount });
    });

    socket.on('disconnect', () => {
      rateMap.delete(socket.id);
    });
  });

  // Expose room stats for teacher dashboard API
  (io as unknown as Record<string, unknown>)._getRoomStats = async (roomName: string) => {
    const sockets = await io.in(roomName).fetchSockets();
    return { peerCount: sockets.length };
  };

  return io;
}

export type { Server as IoServer };
