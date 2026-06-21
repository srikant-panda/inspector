const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
function gatherSystemInfo(options = {}) {
  const { includeHeavy = false } = options;
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
    shell:         safe(() => process.env.SHELL || 'N/A'),
    cpu:           cpuInfo,
    memory: {
      totalMB,
      freeMB,
      usedPercent,
    },
    loadAvg: safe(() => {
      const avg = os.loadavg();
      return avg.length >= 3
        ? [Number(avg[0].toFixed(2)), Number(avg[1].toFixed(2)), Number(avg[2].toFixed(2))]
        : 'N/A';
    }, 'N/A'),
    env,
    disk: includeHeavy ? safe(() => gatherDiskInfo(), 'N/A') : 'N/A',
    battery: includeHeavy ? safe(() => gatherBatteryInfo(), 'N/A') : 'N/A',
  };
}

/**
 * Gathers disk information in a cross-platform manner.
 */
function gatherDiskInfo() {
  try {
    const platform = os.platform();
    if (platform === 'win32') {
      try {
        const out = execSync('powershell -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, FreeSpace, Size | ConvertTo-Json -Compress"', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        if (out.trim()) {
          const parsed = JSON.parse(out.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          const disks = [];
          for (const d of list) {
            if (d && d.DeviceID && d.Size > 0) {
              const drive = d.DeviceID;
              const freeBytes = d.FreeSpace || 0;
              const sizeBytes = d.Size || 0;
              const totalGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(2);
              const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(2);
              const usedBytes = sizeBytes - freeBytes;
              const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
              const usedPct = Number(((usedBytes / sizeBytes) * 100).toFixed(1));
              disks.push({ drive, totalGB, usedGB, freeGB, usedPct });
            }
          }
          if (disks.length > 0) return disks;
        }
      } catch (err) {
        // Fall back to wmic if powershell fails
      }

      const out = execSync('wmic logicaldisk get Caption,FreeSpace,Size', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = out.replace(/\r/g, '').trim().split('\n');
      const disks = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 3) {
          const drive = parts[0];
          const freeBytes = parseInt(parts[1], 10);
          const sizeBytes = parseInt(parts[2], 10);
          if (!isNaN(freeBytes) && !isNaN(sizeBytes) && sizeBytes > 0) {
            const totalGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(2);
            const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(2);
            const usedBytes = sizeBytes - freeBytes;
            const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
            const usedPct = Number(((usedBytes / sizeBytes) * 100).toFixed(1));
            disks.push({ drive, totalGB, usedGB, freeGB, usedPct });
          }
        }
      }
      return disks.length > 0 ? disks : 'N/A';
    } else {
      const out = execSync('df -h / 2>/dev/null || df -h', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = out.trim().split('\n');
      const disks = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 5) {
          const drive = parts[0];
          const sizeStr = parts[1];
          const usedStr = parts[2];
          const freeStr = parts[3];
          const usePctStr = parts[4];
          const usePct = parseInt(usePctStr.replace('%', ''), 10);
          const mount = parts[5] || '';
          if (mount === '/' || drive.startsWith('/dev/')) {
            disks.push({
              drive: mount || drive,
              totalGB: sizeStr,
              usedGB: usedStr,
              freeGB: freeStr,
              usedPct: isNaN(usePct) ? 'N/A' : usePct,
            });
          }
        }
      }
      return disks.length > 0 ? disks : 'N/A';
    }
  } catch (err) {
    return 'N/A';
  }
}

/**
 * Gathers battery percentage and charging status in a cross-platform manner.
 */
function gatherBatteryInfo() {
  try {
    const platform = os.platform();
    if (platform === 'win32') {
      try {
        const out = execSync('powershell -Command "Get-CimInstance Win32_Battery | Select-Object BatteryStatus, EstimatedChargeRemaining | ConvertTo-Json -Compress"', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        if (out.trim()) {
          const parsed = JSON.parse(out.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of list) {
            if (item && item.EstimatedChargeRemaining !== undefined) {
              const statusVal = item.BatteryStatus;
              const percent = item.EstimatedChargeRemaining;
              let status = 'Unknown';
              if (statusVal === 1) status = 'Discharging';
              else if (statusVal === 2) status = 'On AC Power';
              else if (statusVal === 3) status = 'Fully Charged';
              else if (statusVal >= 6 && statusVal <= 9) status = 'Charging';
              return { percent, status };
            }
          }
        }
      } catch (err) {
        // Fall back to wmic if powershell fails
      }

      try {
        const out = execSync('wmic path Win32_Battery get EstimatedChargeRemaining,BatteryStatus', {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        const lines = out.replace(/\r/g, '').trim().split('\n');
        if (lines.length >= 2) {
          const parts = lines[1].trim().split(/\s+/);
          if (parts.length >= 2) {
            const statusVal = parseInt(parts[0], 10);
            const percent = parseInt(parts[1], 10);
            let status = 'Unknown';
            if (statusVal === 1) status = 'Discharging';
            else if (statusVal === 2) status = 'On AC Power';
            else if (statusVal === 3) status = 'Fully Charged';
            else if (statusVal >= 6 && statusVal <= 9) status = 'Charging';
            return { percent, status };
          }
        }
      } catch (err) {}
      return 'N/A';
    } else if (platform === 'darwin') {
      const out = execSync('pmset -g batt', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const match = out.match(/(\d+)%;\s+(\w+);/);
      if (match) {
        const percent = parseInt(match[1], 10);
        const statusRaw = match[2].toLowerCase();
        let status = 'Unknown';
        if (statusRaw === 'charging') status = 'Charging';
        else if (statusRaw === 'discharging') status = 'Discharging';
        else if (statusRaw === 'charged' || statusRaw === 'finishing charge') status = 'Fully Charged';
        return { percent, status };
      }
      return 'N/A';
    } else if (platform === 'linux') {
      const powerSupplyDir = '/sys/class/power_supply';
      if (fs.existsSync(powerSupplyDir)) {
        const dirs = fs.readdirSync(powerSupplyDir);
        const batDir = dirs.find(d => d.startsWith('BAT'));
        if (batDir) {
          const capacityPath = path.join(powerSupplyDir, batDir, 'capacity');
          const statusPath = path.join(powerSupplyDir, batDir, 'status');
          if (fs.existsSync(capacityPath) && fs.existsSync(statusPath)) {
            const percent = parseInt(fs.readFileSync(capacityPath, 'utf8').trim(), 10);
            const status = fs.readFileSync(statusPath, 'utf8').trim();
            return { percent, status };
          }
        }
      }
      return 'N/A';
    }
    return 'N/A';
  } catch (err) {
    return 'N/A';
  }
}

module.exports = { gatherSystemInfo, gatherDiskInfo, gatherBatteryInfo };
