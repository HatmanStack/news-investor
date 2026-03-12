import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

let logger: typeof import('../logger.util.js').logger;
let runWithContext: typeof import('../logger.util.js').runWithContext;
let createRequestContext: typeof import('../logger.util.js').createRequestContext;
let getCorrelationId: typeof import('../logger.util.js').getCorrelationId;

let consoleSpy: {
  log: ReturnType<typeof jest.spyOn>;
  warn: ReturnType<typeof jest.spyOn>;
  error: ReturnType<typeof jest.spyOn>;
};

beforeEach(async () => {
  consoleSpy = {
    log: jest.spyOn(console, 'log').mockImplementation(() => {}),
    warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
    error: jest.spyOn(console, 'error').mockImplementation(() => {}),
  };
});

afterEach(() => {
  consoleSpy.log.mockRestore();
  consoleSpy.warn.mockRestore();
  consoleSpy.error.mockRestore();
  delete process.env.LOG_LEVEL;
  delete process.env._X_AMZN_TRACE_ID;
});

// Re-import for each describe to pick up env changes.
// The module reads LOG_LEVEL on each call, so a single import works.
beforeEach(async () => {
  const mod = await import('../logger.util.js');
  logger = mod.logger;
  runWithContext = mod.runWithContext;
  createRequestContext = mod.createRequestContext;
  getCorrelationId = mod.getCorrelationId;
});

describe('log level filtering', () => {
  it('should suppress debug messages at default info level', () => {
    logger.debug('should not appear');

    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it('should output info messages at default info level', () => {
    logger.info('visible');

    expect(consoleSpy.log).toHaveBeenCalledTimes(1);
  });

  it('should output warn messages at default info level', () => {
    logger.warn('warning');

    expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
  });

  it('should output error messages at default info level', () => {
    logger.error('failure');

    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
  });

  it('should output debug messages when LOG_LEVEL=debug', () => {
    process.env.LOG_LEVEL = 'debug';
    logger.debug('debug visible');

    expect(consoleSpy.log).toHaveBeenCalledTimes(1);
  });

  it('should suppress info and warn when LOG_LEVEL=error', () => {
    process.env.LOG_LEVEL = 'error';

    logger.debug('no');
    logger.info('no');
    logger.warn('no');
    logger.error('yes');

    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.warn).not.toHaveBeenCalled();
    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
  });

  it('should default to info for invalid LOG_LEVEL values', () => {
    process.env.LOG_LEVEL = 'VERBOSE';
    logger.debug('suppressed');
    logger.info('visible');

    expect(consoleSpy.log).toHaveBeenCalledTimes(1);
  });
});

describe('structured output', () => {
  it('should produce valid JSON with timestamp, level, and message', () => {
    logger.info('test message');

    expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    const output = consoleSpy.log.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test message');
    expect(parsed.timestamp).toBeDefined();
    // Timestamp should be ISO format
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
  });

  it('should include extra data fields in the log entry', () => {
    logger.info('with data', { ticker: 'AAPL', count: 5 });

    const parsed = JSON.parse(consoleSpy.log.mock.calls[0][0] as string);
    expect(parsed.ticker).toBe('AAPL');
    expect(parsed.count).toBe(5);
  });

  it('should route warn level to console.warn', () => {
    logger.warn('caution');

    const parsed = JSON.parse(consoleSpy.warn.mock.calls[0][0] as string);
    expect(parsed.level).toBe('warn');
  });

  it('should route error level to console.error', () => {
    logger.error('bad');

    const parsed = JSON.parse(consoleSpy.error.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
  });
});

describe('context propagation', () => {
  it('should include correlationId when inside runWithContext', async () => {
    const context = createRequestContext('req-123', '/test', 'GET');

    await runWithContext(context, async () => {
      logger.info('inside context');
    });

    const parsed = JSON.parse(consoleSpy.log.mock.calls[0][0] as string);
    expect(parsed.correlationId).toBe('req-123');
    expect(parsed.path).toBe('/test');
    expect(parsed.method).toBe('GET');
  });

  it('should not include correlationId when outside runWithContext', () => {
    logger.info('no context');

    const parsed = JSON.parse(consoleSpy.log.mock.calls[0][0] as string);
    expect(parsed.correlationId).toBeUndefined();
  });
});

describe('error logging', () => {
  it('should include errorMessage, errorName, errorStack for Error instances', () => {
    const err = new Error('something broke');
    logger.error('operation failed', err);

    const parsed = JSON.parse(consoleSpy.error.mock.calls[0][0] as string);
    expect(parsed.errorMessage).toBe('something broke');
    expect(parsed.errorName).toBe('Error');
    expect(parsed.errorStack).toContain('Error: something broke');
  });

  it('should coerce non-Error values to string', () => {
    logger.error('unexpected', 42);

    const parsed = JSON.parse(consoleSpy.error.mock.calls[0][0] as string);
    expect(parsed.error).toBe('42');
  });

  it('should include both error properties and extra data', () => {
    const err = new Error('fail');
    logger.error('handler error', err, { endpoint: '/test' });

    const parsed = JSON.parse(consoleSpy.error.mock.calls[0][0] as string);
    expect(parsed.errorMessage).toBe('fail');
    expect(parsed.endpoint).toBe('/test');
  });

  it('should handle undefined error gracefully', () => {
    logger.error('no error object');

    const parsed = JSON.parse(consoleSpy.error.mock.calls[0][0] as string);
    expect(parsed.errorMessage).toBeUndefined();
    expect(parsed.error).toBeUndefined();
  });
});

describe('X-Ray trace', () => {
  it('should include xrayTraceId from _X_AMZN_TRACE_ID env var', async () => {
    process.env._X_AMZN_TRACE_ID = 'Root=1-abc-def;Parent=xyz;Sampled=1';
    const context = createRequestContext('req-456');

    expect(context.xrayTraceId).toBe('1-abc-def');

    await runWithContext(context, async () => {
      logger.info('with trace');
    });

    const parsed = JSON.parse(consoleSpy.log.mock.calls[0][0] as string);
    expect(parsed.xrayTraceId).toBe('1-abc-def');
  });

  it('should handle missing _X_AMZN_TRACE_ID', () => {
    const context = createRequestContext('req-789');
    expect(context.xrayTraceId).toBeUndefined();
  });
});

describe('getCorrelationId', () => {
  it('should return undefined outside context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('should return the correlationId inside context', async () => {
    const context = createRequestContext('corr-001');

    await runWithContext(context, async () => {
      expect(getCorrelationId()).toBe('corr-001');
    });
  });
});
