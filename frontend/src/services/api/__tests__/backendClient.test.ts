/**
 * Backend Client Tests
 *
 * Verifies 401 response interceptor clears cached client
 * so the next request creates a fresh client with a new token.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

// Mock cognito service before importing backendClient
jest.mock('@/services/auth/cognito.service', () => ({
  getIdToken: jest.fn().mockResolvedValue('mock-token'),
}));

// Mock environment
jest.mock('@/config/environment', () => ({
  Environment: {
    BACKEND_URL: 'https://mock-api.example.com',
  },
}));

describe('backendClient', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should clear cached client on 401 response', async () => {
    const { createBackendClient } = require('../backendClient');

    // Create client (gets cached)
    const client1 = createBackendClient();
    expect(client1).toBeDefined();

    // Simulate a 401 response via the response interceptor
    const errorInterceptor = client1.interceptors.response.handlers[0]?.rejected;
    expect(errorInterceptor).toBeDefined();

    const error401 = {
      response: { status: 401 },
      config: {},
    };

    // Call the interceptor - it should reject
    await expect(errorInterceptor(error401)).rejects.toBeDefined();

    // Next call should create a new client (not the cached one)
    const client2 = createBackendClient();
    expect(client2).not.toBe(client1);
  });

  it('should pass through non-401 errors unchanged', async () => {
    const { createBackendClient } = require('../backendClient');

    const client = createBackendClient();
    const errorInterceptor = client.interceptors.response.handlers[0]?.rejected;

    const error500 = {
      response: { status: 500 },
      config: {},
    };

    // Non-401 errors should be rejected without clearing cache
    await expect(errorInterceptor(error500)).rejects.toBe(error500);

    // Cached client should still be the same
    const client2 = createBackendClient();
    expect(client2).toBe(client);
  });

  it('should pass through successful responses', async () => {
    const { createBackendClient } = require('../backendClient');

    const client = createBackendClient();
    const successInterceptor = client.interceptors.response.handlers[0]?.fulfilled;

    const response = { status: 200, data: { test: true } };
    const result = successInterceptor(response);
    expect(result).toBe(response);
  });
});
