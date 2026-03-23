/**
 * Tests for withRepoLogging utility
 */

import { withRepoLogging, withRepoLoggingDefault } from '../repoLogging';
import { logger } from '@/utils/logger';

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

const mockLoggerError = logger.error as jest.MockedFunction<typeof logger.error>;

describe('withRepoLogging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the result on success', async () => {
    const result = await withRepoLogging('TestRepo', 'findAll', async () => {
      return [1, 2, 3];
    });
    expect(result).toEqual([1, 2, 3]);
  });

  it('does not call logger on success', async () => {
    await withRepoLogging('TestRepo', 'findAll', async () => 'ok');
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('logs error and re-throws on failure', async () => {
    const error = new Error('db failed');
    await expect(
      withRepoLogging('TestRepo', 'findAll', async () => {
        throw error;
      }),
    ).rejects.toThrow('db failed');

    expect(mockLoggerError).toHaveBeenCalledWith('TestRepo', 'findAll failed', error);
  });

  it('calls logger with correct repoName and operation', async () => {
    const error = new Error('oops');
    await expect(
      withRepoLogging('AnnotationsRepo', 'upsert', async () => {
        throw error;
      }),
    ).rejects.toThrow();

    expect(mockLoggerError).toHaveBeenCalledWith('AnnotationsRepo', 'upsert failed', error);
  });
});

describe('withRepoLoggingDefault', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the result on success', async () => {
    const result = await withRepoLoggingDefault('TestRepo', 'count', 0, async () => 42);
    expect(result).toBe(42);
  });

  it('returns the default value on failure', async () => {
    const result = await withRepoLoggingDefault('TestRepo', 'count', 0, async () => {
      throw new Error('db failed');
    });
    expect(result).toBe(0);
  });

  it('logs error on failure', async () => {
    const error = new Error('db failed');
    await withRepoLoggingDefault('TestRepo', 'count', 0, async () => {
      throw error;
    });
    expect(mockLoggerError).toHaveBeenCalledWith('TestRepo', 'count failed', error);
  });

  it('returns default array on failure', async () => {
    const result = await withRepoLoggingDefault('TestRepo', 'findAll', [] as string[], async () => {
      throw new Error('fail');
    });
    expect(result).toEqual([]);
  });

  it('returns default null on failure', async () => {
    const result = await withRepoLoggingDefault('TestRepo', 'findById', null, async () => {
      throw new Error('fail');
    });
    expect(result).toBeNull();
  });
});
