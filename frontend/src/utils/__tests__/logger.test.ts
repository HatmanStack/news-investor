/**
 * Tests for the structured frontend logger
 */

describe('logger', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  // We import fresh each time to get clean module state
  function getLogger() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logger } = require('../logger');
    return logger;
  }

  describe('debug', () => {
    it('calls console.log with structured output', () => {
      const logger = getLogger();
      logger.debug('TestModule', 'test message', { key: 1 });
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('TestModule');
      expect(output).toContain('test message');
    });
  });

  describe('info', () => {
    it('calls console.log with structured output', () => {
      const logger = getLogger();
      logger.info('TestModule', 'info message', { count: 5 });
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toContain('TestModule');
      expect(output).toContain('info message');
    });
  });

  describe('warn', () => {
    it('calls console.warn with structured output', () => {
      const logger = getLogger();
      logger.warn('TestModule', 'warning message');
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      const output = consoleSpy.warn.mock.calls[0][0];
      expect(output).toContain('TestModule');
      expect(output).toContain('warning message');
    });
  });

  describe('error', () => {
    it('calls console.error with structured output', () => {
      const logger = getLogger();
      logger.error('TestModule', 'error message');
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('TestModule');
      expect(output).toContain('error message');
    });

    it('includes Error details when passed an Error object', () => {
      const logger = getLogger();
      const err = new Error('test error');
      logger.error('TestModule', 'something failed', err);
      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('test error');
      expect(output).toContain('Error');
    });

    it('handles non-Error values', () => {
      const logger = getLogger();
      logger.error('TestModule', 'something failed', 'string error');
      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('string error');
    });

    it('includes additional context fields', () => {
      const logger = getLogger();
      const err = new Error('test');
      logger.error('TestModule', 'failed', err, { ticker: 'AAPL' });
      const output = consoleSpy.error.mock.calls[0][0];
      expect(output).toContain('AAPL');
    });
  });

  describe('development format', () => {
    it('uses human-readable prefix format', () => {
      const logger = getLogger();
      logger.info('MyModule', 'hello world');
      const output = consoleSpy.log.mock.calls[0][0];
      // Development format: [INFO] MyModule: hello world
      expect(output).toMatch(/\[INFO\] MyModule: hello world/);
    });

    it('includes context as JSON when present', () => {
      const logger = getLogger();
      logger.info('MyModule', 'found records', { count: 5 });
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toMatch(/\[INFO\] MyModule: found records/);
      expect(output).toContain('"count":5');
    });

    it('omits context JSON when no context provided', () => {
      const logger = getLogger();
      logger.info('MyModule', 'simple message');
      const output = consoleSpy.log.mock.calls[0][0];
      expect(output).toBe('[INFO] MyModule: simple message');
    });
  });

  describe('exports', () => {
    it('exports LOG_LEVELS constant', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LOG_LEVELS } = require('../logger');
      expect(LOG_LEVELS).toEqual({
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
      });
    });
  });
});
