import { beforeEach, describe, expect, it } from 'vitest';

import { app } from '../src/index';
import { authedFetch, extractCookieHeader, resetDb, signIn, signUp, uniqueEmail } from './helpers';

// Better Auth エラー形式 (`{ message, code, ... }`) は触らない方針 (CLAUDE.md 5章)。
// よって error 系は status code のみ確認する。

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/auth/sign-up/email', () => {
  describe('success', () => {
    it('新規 user signup → 200 + token + user', async () => {
      const email = uniqueEmail('signup');
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'password1234', name: 'Test' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user?: { email?: string }; token?: string };
      expect(body.user?.email).toBe(email);
      // bearer plugin は set-auth-token ヘッダ / body.token のどちらかで token を返す。
      const hasToken = Boolean(body.token) || Boolean(res.headers.get('set-auth-token'));
      expect(hasToken).toBe(true);
    });
  });

  describe('validation', () => {
    it('重複 email → 4xx', async () => {
      const email = uniqueEmail('dup');
      await signUp(app, email, 'password1234');
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'password1234', name: 'dup' }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('弱パスワード (8文字未満) → 4xx', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: uniqueEmail('weak'),
          password: 'short',
          name: 'weak',
        }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('不正 email 形式 → 4xx', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'password1234',
          name: 'x',
        }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});

describe('POST /api/auth/sign-in/email', () => {
  describe('success', () => {
    it('正しい credentials → 200', async () => {
      const email = uniqueEmail('signin');
      await signUp(app, email, 'password1234');
      const { cookie, body } = await signIn(app, email, 'password1234');
      expect(cookie.length).toBeGreaterThan(0);
      expect((body as { user?: { email?: string } }).user?.email).toBe(email);
    });
  });

  describe('errors', () => {
    it('不正パスワード → 4xx', async () => {
      const email = uniqueEmail('badpw');
      await signUp(app, email, 'password1234');
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('存在しない email → 4xx', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: uniqueEmail('nouser'),
          password: 'password1234',
        }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});

describe('session lifecycle', () => {
  it('signup → /api/auth/get-session で user 取れる', async () => {
    const email = uniqueEmail('session');
    const { cookie } = await signUp(app, email, 'password1234');
    const res = await authedFetch(app, cookie, '/api/auth/get-session');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user?: { email?: string } } | null;
    expect(body?.user?.email).toBe(email);
  });

  it('signout → 後の get-session で user=null', async () => {
    const email = uniqueEmail('signout');
    const { cookie } = await signUp(app, email, 'password1234');
    const signoutRes = await authedFetch(app, cookie, '/api/auth/sign-out', { method: 'POST' });
    expect(signoutRes.status).toBe(200);
    const clearedCookie = extractCookieHeader(signoutRes) || cookie;
    const res = await authedFetch(app, clearedCookie, '/api/auth/get-session');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: unknown } | null;
    expect(body?.user ?? null).toBeNull();
  });
});
