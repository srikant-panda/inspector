const os = require('os');

/**
 * Wraps a function call in a try/catch so missing or unavailable OS data
 * never crashes the program. Returns `fallback` on any thrown error.
 *
 * @param {Function} fn   – thunk (zero-arg function) to evaluate
 * @param {*} [fallback]  – value returned when fn throws (default 'N/A')
 * @returns {*}
 */
function safe(fn, fallback = 'N/A') {
  try {
    const result = fn();
    // Treat undefined/null as unavailable
    return result !== undefined && result !== null ? result : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Only these env vars are considered safe to expose.
 * Anything outside this list (API keys, tokens, DB passwords …) is silently dropped.
 */
const ENV_WHITELIST = [
  'USER',
  'USERNAME',
  'HOME',
  'SHELL',
  'LANG',
  'PATH',
  'TERM',
  'PWD',
  'EDITOR',
  'NODE_ENV',
];

/**
 * Gathers a snapshot of the current system + environment information.
 * Every OS/process lookup is wrapped in `safe()` so the function always
 * returns a complete object, filling in 'N/A' for unavailable fields.
 *
 * @returns {object} System information snapshot
 */
function gatherSystemInfo() {
  // CPU — handle the edge case where os.cpus() returns an empty array
  const cpus = safe(() => os.cpus(), []);
  const cpuInfo = Array.isArray(cpus) && cpus.length > 0
    ? {
        model: cpus[0].model.trim(),
        cores: cpus.length,
        speedMHz: cpus[0].speed,
      }
    : { model: 'N/A', cores: 'N/A', speedMHz: 'N/A' };

  // Memory
  const totalBytes = safe(() => os.totalmem(), 0);
  const freeBytes  = safe(() => os.freemem(), 0);
  const totalMB    = Number((totalBytes / (1024 * 1024)).toFixed(2));
  const freeMB     = Number((freeBytes  / (1024 * 1024)).toFixed(2));
  const usedPercent = totalBytes > 0
    ? Number((((totalBytes - freeBytes) / totalBytes) * 100).toFixed(2))
    : 'N/A';

  // Env — whitelist only
  const env = {};
  for (const key of ENV_WHITELIST) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }

  return {
    timestamp: safe(() => new Date().toISOString()),
    os: {
      type:     safe(() => os.type()),
      platform: safe(() => os.platform()),
      release:  safe(() => os.release()),
      arch:     safe(() => os.arch()),
    },
    hostname:      safe(() => os.hostname()),
    nodeVersion:   safe(() => process.version),
    uptimeSeconds: safe(() => os.uptime()),
    homedir:       safe(() => os.homedir()),
    cwd:           safe(() => process.cwd()),
    cpu:           cpuInfo,
    memory: {
      totalMB,
      freeMB,
      usedPercent,
    },
    env,
  };
}

module.exports = { gatherSystemInfo };
