import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { setRefreshToken, validateRefreshToken, revokeRefreshToken } from '../lib/redis';

const ACCESS_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me';
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export async function signRefreshToken(userId: number): Promise<string> {
  const jti = uuidv4();
  const token = jwt.sign({ sub: userId, jti }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  await setRefreshToken(userId, jti);
  return token;
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as unknown as JwtPayload;
}

export async function rotateRefreshToken(token: string): Promise<{ accessToken: string; refreshToken: string; payload: JwtPayload } | null> {
  let decoded: { sub: number; jti: string };
  try {
    decoded = jwt.verify(token, REFRESH_SECRET) as unknown as { sub: number; jti: string };
  } catch {
    return null;
  }

  const valid = await validateRefreshToken(decoded.sub, decoded.jti);
  if (!valid) return null;

  await revokeRefreshToken(decoded.sub, decoded.jti);

  const { prisma } = await import('../lib/prisma');
  const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
  if (!user) return null;

  const jwtPayload: JwtPayload = { sub: user.id, username: user.username, role: user.role };
  const accessToken = signAccessToken(jwtPayload);
  const refreshToken = await signRefreshToken(user.id);

  return { accessToken, refreshToken, payload: jwtPayload };
}
