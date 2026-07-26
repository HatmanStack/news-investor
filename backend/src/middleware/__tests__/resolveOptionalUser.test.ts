/**
 * Tests for resolveOptionalUser — caller identification on routes that carry
 * no API Gateway authorizer.
 *
 * These are the security boundary for tier resolution: if an unverified token
 * were trusted here, anyone could claim any tier by editing a JWT payload.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const mockVerify = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>();
const mockCreate = jest.fn((..._args: unknown[]) => ({ verify: mockVerify }));

jest.unstable_mockModule('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mockCreate },
}));

jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { resolveOptionalUser, resetVerifierForTests } = await import('../auth.middleware.js');

function evt(opts?: { header?: string; claims?: Record<string, string> }): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (opts?.header) headers.authorization = opts.header;
  return {
    headers,
    requestContext: opts?.claims ? { authorizer: { jwt: { claims: opts.claims } } } : {},
  } as unknown as APIGatewayProxyEventV2;
}

describe('resolveOptionalUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetVerifierForTests();
    process.env.COGNITO_USER_POOL_ID = 'us-west-2_test';
    process.env.COGNITO_CLIENT_ID = 'client123';
    mockVerify.mockResolvedValue({ sub: 'user-1', email: 'a@b.com' });
  });

  afterEach(() => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;
  });

  describe('anonymous callers', () => {
    it('returns null when no Authorization header is present', async () => {
      await expect(resolveOptionalUser(evt())).resolves.toBeNull();
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('returns null for an empty bearer value', async () => {
      await expect(resolveOptionalUser(evt({ header: 'Bearer ' }))).resolves.toBeNull();
    });
  });

  describe('token verification', () => {
    it('identifies a caller presenting a valid token', async () => {
      const user = await resolveOptionalUser(evt({ header: 'Bearer good.jwt.token' }));

      expect(user).toEqual({ sub: 'user-1', email: 'a@b.com' });
      expect(mockVerify).toHaveBeenCalledWith('good.jwt.token');
    });

    it('strips the Bearer prefix before verifying', async () => {
      await resolveOptionalUser(evt({ header: 'Bearer abc' }));
      expect(mockVerify).toHaveBeenCalledWith('abc');
    });

    it('accepts a bare token without the Bearer prefix', async () => {
      await resolveOptionalUser(evt({ header: 'abc' }));
      expect(mockVerify).toHaveBeenCalledWith('abc');
    });

    it('degrades to anonymous when verification fails', async () => {
      // Public route: an expired or tampered token must not 500, it must simply
      // not confer a tier.
      mockVerify.mockRejectedValue(new Error('Token expired'));

      await expect(resolveOptionalUser(evt({ header: 'Bearer stale' }))).resolves.toBeNull();
    });

    it('rejects a verified token that carries no sub', async () => {
      mockVerify.mockResolvedValue({ email: 'a@b.com' });

      await expect(resolveOptionalUser(evt({ header: 'Bearer x' }))).resolves.toBeNull();
    });

    it('tolerates a token with no email claim', async () => {
      mockVerify.mockResolvedValue({ sub: 'user-2' });

      await expect(resolveOptionalUser(evt({ header: 'Bearer x' }))).resolves.toEqual({
        sub: 'user-2',
        email: '',
      });
    });
  });

  describe('authorizer claims take precedence', () => {
    it('uses claims already verified by API Gateway without re-verifying', async () => {
      // Avoids a JWKS round trip on routes that do carry an authorizer.
      const user = await resolveOptionalUser(
        evt({ claims: { sub: 'from-apigw', email: 'x@y.com' }, header: 'Bearer ignored' }),
      );

      expect(user).toEqual({ sub: 'from-apigw', email: 'x@y.com' });
      expect(mockVerify).not.toHaveBeenCalled();
    });
  });

  describe('unconfigured Cognito', () => {
    it('treats every caller as anonymous when the pool is not configured', async () => {
      // Auth-optional deployments and the community edition run this way; a
      // token must not be honoured without a pool to verify it against.
      delete process.env.COGNITO_USER_POOL_ID;
      resetVerifierForTests();

      await expect(resolveOptionalUser(evt({ header: 'Bearer x' }))).resolves.toBeNull();
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('does not construct a verifier without a client id', async () => {
      delete process.env.COGNITO_CLIENT_ID;
      resetVerifierForTests();

      await resolveOptionalUser(evt({ header: 'Bearer x' }));
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('verifier caching', () => {
    it('builds the verifier once across calls so JWKS is fetched per container', async () => {
      await resolveOptionalUser(evt({ header: 'Bearer a' }));
      await resolveOptionalUser(evt({ header: 'Bearer b' }));
      await resolveOptionalUser(evt({ header: 'Bearer c' }));

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('verifies id tokens against the configured pool and client', async () => {
      await resolveOptionalUser(evt({ header: 'Bearer a' }));

      expect(mockCreate).toHaveBeenCalledWith({
        userPoolId: 'us-west-2_test',
        tokenUse: 'id',
        clientId: 'client123',
      });
    });
  });
});
