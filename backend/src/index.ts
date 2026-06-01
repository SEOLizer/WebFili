import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRouter from './routes/auth';
import projectsRouter from './routes/projects';
import linksRouter from './routes/links';
import { initSocketServer } from './websocket/broker';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true });
app.use(limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true });
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/links', linksRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '0.6.0' }));

const httpServer = http.createServer(app);
export const io = initSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`WebFilius Backend läuft auf http://localhost:${PORT}`);
});

export default app;
