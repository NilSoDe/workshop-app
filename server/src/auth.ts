/**
 * Autenticación sencilla sin dependencias:
 *  - Usuarios en un JSON (DATA_DIR/users.json), contraseña con scrypt + sal.
 *  - Sesión = token firmado con HMAC-SHA256 (`payload.firma`), caduca a los 30 días.
 *  - El secreto sale de AUTH_SECRET o se genera y guarda en DATA_DIR/auth-secret.
 *
 * Es suficiente para el MVP / uso propio. Para producción seria: BD real, límites
 * por IP, verificación de email y recuperación de contraseña.
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { HttpError } from './util';

export interface PublicUser {
  id: string;
  email: string;
  name?: string;
}

interface StoredUser extends PublicUser {
  salt: string;
  hash: string;
  createdAt: string;
}

const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const dataDir = () => path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'));
const usersFile = () => path.join(dataDir(), 'users.json');

// --- Almacén de usuarios ----------------------------------------------------

let writeQueue: Promise<unknown> = Promise.resolve();
/** Serializa las escrituras para que dos registros simultáneos no se pisen. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function readUsers(): Promise<StoredUser[]> {
  try {
    return JSON.parse(await readFile(usersFile(), 'utf8')) as StoredUser[];
  } catch {
    return [];
  }
}

async function writeUsers(users: StoredUser[]): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  const tmp = `${usersFile()}.tmp`;
  await writeFile(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  await rename(tmp, usersFile());
}

// --- Contraseñas ------------------------------------------------------------

const scryptAsync = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))),
  );

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return { salt: salt.toString('hex'), hash: (await scryptAsync(password, salt)).toString('hex') };
}

async function verifyPassword(password: string, u: StoredUser): Promise<boolean> {
  const expected = Buffer.from(u.hash, 'hex');
  const actual = await scryptAsync(password, Buffer.from(u.salt, 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- Tokens -----------------------------------------------------------------

let cachedSecret: string | null = null;
async function secret(): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (cachedSecret) return cachedSecret;
  const file = path.join(dataDir(), 'auth-secret');
  try {
    cachedSecret = (await readFile(file, 'utf8')).trim();
  } catch {
    cachedSecret = randomBytes(32).toString('hex');
    await mkdir(dataDir(), { recursive: true });
    await writeFile(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

async function issueToken(userId: string): Promise<string> {
  const payload = b64(JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload, await secret())}`;
}

async function verifyToken(token: string): Promise<string | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, await secret()));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string; exp: number };
    return exp > Date.now() ? sub : null;
  } catch {
    return null;
  }
}

// --- Operaciones ------------------------------------------------------------

const publicUser = (u: StoredUser): PublicUser => ({ id: u.id, email: u.email, name: u.name });

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export async function register(input: { email?: string; password?: string; name?: string }): Promise<AuthResponse> {
  const email = (input.email ?? '').trim().toLowerCase();
  const password = input.password ?? '';
  const name = input.name?.trim().slice(0, 60) || undefined;
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Introduce un email válido');
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  if (password.length > 200) throw new HttpError(400, 'Contraseña demasiado larga');
  const { salt, hash } = await hashPassword(password);
  const user = await exclusive(async () => {
    const users = await readUsers();
    if (users.some((u) => u.email === email)) throw new HttpError(409, 'Ya existe una cuenta con ese email');
    const u: StoredUser = { id: randomBytes(8).toString('hex'), email, name, salt, hash, createdAt: new Date().toISOString() };
    await writeUsers([...users, u]);
    return u;
  });
  return { token: await issueToken(user.id), user: publicUser(user) };
}

export async function login(input: { email?: string; password?: string }): Promise<AuthResponse> {
  const email = (input.email ?? '').trim().toLowerCase();
  const user = (await readUsers()).find((u) => u.email === email);
  // Mismo mensaje y mismo coste si el usuario no existe: no revela qué emails están registrados.
  const ok = user ? await verifyPassword(input.password ?? '', user) : (await scryptAsync('x', randomBytes(16)), false);
  if (!user || !ok) throw new HttpError(401, 'Email o contraseña incorrectos');
  return { token: await issueToken(user.id), user: publicUser(user) };
}

export async function userFromToken(token: string): Promise<PublicUser | null> {
  const id = await verifyToken(token);
  if (!id) return null;
  const u = (await readUsers()).find((x) => x.id === id);
  return u ? publicUser(u) : null;
}

// --- Middleware -------------------------------------------------------------

export const authDisabled = () => process.env.AUTH_DISABLED === '1';

/** Token de `Authorization: Bearer …` o, para abrir PDFs desde el navegador, `?token=`. */
export function extractToken(headers: Headers, url: string): string | null {
  const h = headers.get('authorization');
  if (h?.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  return new URL(url).searchParams.get('token');
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (authDisabled()) return next();
  const token = extractToken(c.req.raw.headers, c.req.url);
  const user = token ? await userFromToken(token) : null;
  if (!user) throw new HttpError(401, 'Inicia sesión para continuar');
  c.set('user', user);
  return next();
};
