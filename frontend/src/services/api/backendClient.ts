import axios, { AxiosInstance } from 'axios';
import { Environment } from '@/config/environment';

const BACKEND_TIMEOUT = 30000;

let cachedClient: AxiosInstance | null = null;

export function createBackendClient(): AxiosInstance {
  if (cachedClient) return cachedClient;

  if (!Environment.BACKEND_URL) {
    throw new Error('Backend URL not configured. Set EXPO_PUBLIC_BACKEND_URL in .env file.');
  }

  cachedClient = axios.create({
    baseURL: Environment.BACKEND_URL,
    timeout: BACKEND_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
  });

  return cachedClient;
}
