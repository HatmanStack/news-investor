/**
 * Root layout initialisation.
 *
 * The failure this pins: `initialize()` re-threw on a configuration error inside
 * an async function invoked fire-and-forget with no `.catch()`. `ErrorBoundary`
 * wraps the tree but catches render-phase errors only, so it never saw it —
 * `setIsReady(true)` was skipped and the layout rendered an unconditional
 * `ActivityIndicator`. A misconfigured environment produced an infinite spinner
 * and an unhandled rejection, not the error screen the code's own comment
 * described.
 *
 * `frontend/app/**` is currently outside `collectCoverageFrom`, so this moves no
 * coverage number until Phase 6 adds it. It is written anyway because the
 * behaviour is the finding.
 */

/* eslint-disable import/first */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { EnvironmentConfigError } from '../../src/config/environment';

const mockValidateEnvironment = jest.fn();
const mockInitializeDatabase = jest.fn();

jest.mock('../../src/config/environment', () => {
  // Mocked by the same specifier the layout uses, and spreading the real module
  // so `EnvironmentConfigError` is the *same class object* on both sides — an
  // `instanceof` check across two copies of a module silently answers false.
  const actual = jest.requireActual('../../src/config/environment');
  return {
    ...actual,
    validateEnvironment: () => mockValidateEnvironment(),
  };
});

jest.mock('../../src/database', () => ({
  initializeDatabase: () => mockInitializeDatabase(),
}));

jest.mock('expo-router', () => ({
  Slot: () => null,
}));

// The native gesture-handler module is not installed in this environment, and
// the non-fatal cases below render the full provider tree.
jest.mock('react-native-gesture-handler', () => {
  const { View } = jest.requireActual('react-native');
  return { GestureHandlerRootView: View };
});

jest.mock('expo-router/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-font', () => ({
  // Keep the members jest.setup.js provides: @expo/vector-icons calls
  // Font.isLoaded during render, and replacing the module with useFonts alone
  // makes every icon in the tree throw.
  useFonts: () => [true],
  loadAsync: () => Promise.resolve(),
  isLoaded: () => true,
  isLoading: () => false,
}));

const mockLoggerError = jest.fn();
jest.mock('../../src/utils/logger', () => ({
  // Every member is a lazy wrapper: this factory runs while `_layout` is being
  // imported, which is before the consts above are initialised, so referencing
  // them eagerly would capture undefined.
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: () => {},
    info: () => {},
    debug: () => {},
  },
}));

import RootLayout from '../_layout';

/**
 * Render and let initialisation settle inside `act`.
 *
 * `initialize()` is fire-and-forget by design — the layout must not block paint
 * on it — so its state updates land in a microtask after `render()` returns.
 * Flushing them inside `act` is what keeps React from discarding the update and
 * tearing the tree down.
 */
async function renderSettled() {
  const utils = render(<RootLayout />);
  await act(async () => {
    // A macrotask, not a single microtask: `initialize()` awaits two dynamic
    // imports before its state updates land.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return utils;
}

describe('RootLayout initialisation', () => {
  let unhandled: unknown[] = [];
  const captureUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    unhandled = [];
    process.on('unhandledRejection', captureUnhandled);
    mockValidateEnvironment.mockReturnValue(undefined);
    mockInitializeDatabase.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.off('unhandledRejection', captureUnhandled);
  });

  it('renders an error view, not a spinner, when configuration is fatally wrong', async () => {
    mockValidateEnvironment.mockImplementation(() => {
      throw new EnvironmentConfigError(['EXPO_PUBLIC_BACKEND_URL'], 'boom');
    });

    const { queryByText, queryByTestId, getByText } = await renderSettled();

    expect(getByText('Configuration error')).toBeTruthy();
    // The variable is named so the message is actionable.
    expect(queryByText('• EXPO_PUBLIC_BACKEND_URL')).toBeTruthy();
    // And the spinner is gone rather than merely covered.
    expect(queryByTestId('ActivityIndicator')).toBeNull();
    expect(queryByText(/Copy .env.example/)).toBeTruthy();
  });

  it('names every missing variable and no values', async () => {
    mockValidateEnvironment.mockImplementation(() => {
      throw new EnvironmentConfigError(
        ['EXPO_PUBLIC_BACKEND_URL', 'EXPO_PUBLIC_COGNITO_CLIENT_ID'],
        'boom',
      );
    });

    const { getByText, queryByText } = await renderSettled();

    expect(getByText('• EXPO_PUBLIC_BACKEND_URL')).toBeTruthy();
    expect(queryByText('• EXPO_PUBLIC_COGNITO_CLIENT_ID')).toBeTruthy();
    // The error carries names only; nothing here can print a value.
    expect(queryByText(/https?:\/\//)).toBeNull();
  });

  it('produces no unhandled rejection on a fatal configuration error', async () => {
    mockValidateEnvironment.mockImplementation(() => {
      throw new EnvironmentConfigError(['EXPO_PUBLIC_BACKEND_URL'], 'boom');
    });

    const { getByText } = await renderSettled();
    expect(getByText('Configuration error')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(unhandled).toEqual([]);
  });

  it('continues past a non-fatal database failure', async () => {
    // Only a configuration error is fatal; a storage failure must still let the
    // app render, which is the behaviour the original catch intended.
    mockInitializeDatabase.mockRejectedValue(new Error('sqlite unavailable'));

    const { queryByText } = await renderSettled();

    await waitFor(() => expect(mockLoggerError).toHaveBeenCalled());
    expect(queryByText('Configuration error')).toBeNull();
  });

  it('discriminates the fatal case by type, not by message text', async () => {
    // The old check was error.message.includes('Environment Configuration
    // Error'). A plain Error carrying that exact wording must no longer be
    // treated as fatal, or the discriminator is still the string.
    mockValidateEnvironment.mockImplementation(() => {
      throw new Error('❌ Environment Configuration Error: EXPO_PUBLIC_BACKEND_URL is not set');
    });

    const { queryByText } = await renderSettled();

    await waitFor(() => expect(mockLoggerError).toHaveBeenCalled());
    expect(queryByText('Configuration error')).toBeNull();
  });
});
