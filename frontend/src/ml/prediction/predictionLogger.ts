/**
 * Prediction Logger
 *
 * Captures all prediction service logs to an in-memory buffer that can be
 * downloaded as a .txt file. Also mirrors to console for dev tools inspection.
 *
 * Usage from browser console:
 *   window.__predictionLog.download()   — download log as .txt
 *   window.__predictionLog.dump()       — print full log to console
 *   window.__predictionLog.clear()      — clear the buffer
 */

const LOG_BUFFER: string[] = [];
const MAX_LINES = 5000;

function timestamp(): string {
  return new Date().toISOString();
}

function append(level: string, message: string) {
  const line = `[${timestamp()}] [${level}] ${message}`;
  LOG_BUFFER.push(line);
  if (LOG_BUFFER.length > MAX_LINES) {
    LOG_BUFFER.splice(0, LOG_BUFFER.length - MAX_LINES);
  }
}

export const predictionLog = {
  log(message: string) {
    append('INFO', message);
    console.log(message);
  },

  warn(message: string) {
    append('WARN', message);
    console.warn(message);
  },

  error(message: string) {
    append('ERROR', message);
    console.error(message);
  },

  /** Log a table as formatted text (also calls console.table) */
  table(label: string, rows: { name: string; F: number; pValue: number }[]) {
    const header = `${'Feature'.padEnd(25)} ${'F'.padStart(8)} ${'p-value'.padStart(8)} Sig`;
    const lines = rows.map(
      (r) =>
        `${r.name.padEnd(25)} ${r.F.toFixed(3).padStart(8)} ${(r.pValue < 0.001 ? '<0.001' : r.pValue.toFixed(3)).padStart(8)} ${r.pValue < 0.05 ? '***' : r.pValue < 0.1 ? '*' : ''}`,
    );
    append('TABLE', `${label}\n  ${header}\n  ${lines.join('\n  ')}`);
    console.log(label);
    console.table(
      rows.map((f) => ({
        feature: f.name,
        F: f.F.toFixed(3),
        pValue: f.pValue < 0.001 ? '<0.001' : f.pValue.toFixed(3),
        sig: f.pValue < 0.05 ? '***' : f.pValue < 0.1 ? '*' : '',
      })),
    );
  },

  /** Get full log as string */
  dump(): string {
    const content = LOG_BUFFER.join('\n');
    console.log(content);
    return content;
  },

  /** Download log as a .txt file */
  download() {
    const content = LOG_BUFFER.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prediction-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  },

  clear() {
    LOG_BUFFER.length = 0;
  },
};

// Expose on window for browser console access
if (typeof window !== 'undefined') {
  (window as any).__predictionLog = predictionLog;
}
