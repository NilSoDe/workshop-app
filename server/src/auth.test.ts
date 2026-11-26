import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from './app';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'auth-'));
  process.env.DATA_DIR = dir;
  delete process.env.AUTH_DISABLED;
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const post = (url: string, body: unknown) =>
  app.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('autenticación', () => {
  it('bloquea /api sin sesión pero deja /health abierto', async () => {
    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/api/providers')).status).toBe(401);
  });

  it('registra, entra y accede con el token', async () => {
    const reg = await post('/api/auth/register', { email: 'Nil@Example.com', password: 'secreta123', name: 'Nil' });
    expect(reg.status).toBe(201);
    const { token, user } = (await reg.json()) as { token: string; user: { email: string } };
    expect(user.email).toBe('nil@example.com');

    const me = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe('nil@example.com');

    const ok = await app.request('/api/providers', { headers: { authorization: `Bearer ${token}` } });
    expect(ok.status).toBe(200);
    // token en query (para abrir PDFs en el navegador)
    expect((await app.request(`/api/providers?token=${token}`)).status).toBe(200);

    const login = await post('/api/auth/login', { email: 'nil@example.com', password: 'secreta123' });
    expect(login.status).toBe(200);
  });

  it('rechaza duplicados, contraseña corta, credenciales malas y tokens manipulados', async () => {
    expect((await post('/api/auth/register', { email: 'nil@example.com', password: 'otra-clave-1' })).status).toBe(409);
    expect((await post('/api/auth/register', { email: 'x@y.com', password: 'corta' })).status).toBe(400);
    expect((await post('/api/auth/register', { email: 'no-es-email', password: 'secreta123' })).status).toBe(400);
    expect((await post('/api/auth/login', { email: 'nil@example.com', password: 'mala-clave' })).status).toBe(401);
    expect((await post('/api/auth/login', { email: 'nadie@example.com', password: 'secreta123' })).status).toBe(401);
    expect((await app.request('/api/providers', { headers: { authorization: 'Bearer abc.def' } })).status).toBe(401);
  });

  it('frena la fuerza bruta tras 10 intentos fallidos', async () => {
    await post('/api/auth/register', { email: 'brute@example.com', password: 'secreta123' });
    for (let i = 0; i < 10; i++) await post('/api/auth/login', { email: 'brute@example.com', password: `mala-${i}` });
    expect((await post('/api/auth/login', { email: 'brute@example.com', password: 'secreta123' })).status).toBe(429);
  });
});
