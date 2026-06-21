const fs   = require('fs');
const path = require('path');

/**
 * Sandboxed file-operations manager.
 *
 * All public CRUD methods accept paths *relative to the sandbox root*.
 * `_resolveSafe()` is the single gatekeeper that guarantees the resolved
 * absolute path still lives inside the sandbox — blocking `../../` traversal
 * attacks before any filesystem call is made.
 */
class FileOps {
  /**
   * @param {string} [rootDir=process.cwd()] – sandbox root directory
   */
  constructor(rootDir = process.cwd()) {
    this.root     = path.resolve(rootDir);
    this.changelog = [];

    // Create 'logs' directory inside the sandbox root
    this.logsDir = path.join(this.root, 'logs');
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      // Generate a date-differentiated session log file name
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const dateName = `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
      this.logFile = path.join(this.logsDir, `session_${dateName}.log`);

      // Write session log header
      fs.writeFileSync(
        this.logFile,
        `==================================================\n` +
        ` SysInspector Session Log\n` +
        ` Start Time:   ${now.toLocaleString()}\n` +
        ` Sandbox Root: ${this.root}\n` +
        `==================================================\n\n`,
        'utf8'
      );
    } catch {
      this.logFile = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves `relativePath` against the sandbox root and verifies that the
   * resulting absolute path is still inside the sandbox.
   * Throws a descriptive error when the path escapes the sandbox boundary.
   *
   * @param {string} relativePath
   * @returns {string} Absolute path guaranteed to be inside the sandbox
   * @throws {Error} Sandbox-escape violation
   */
  _resolveSafe(relativePath) {
    const resolved = path.resolve(this.root, relativePath);
    // Normalise both sides and compare prefix — a trailing separator on the
    // root avoids false positives (e.g. /sandbox vs /sandbox-evil).
    if (
      resolved !== this.root &&
      !resolved.startsWith(this.root + path.sep)
    ) {
      throw new Error(
        `Sandbox escape blocked: "${relativePath}" resolves to "${resolved}", ` +
        `which is outside the sandbox root "${this.root}".`
      );
    }
    return resolved;
  }

  /**
   * Pushes a successful-action entry onto the in-memory changelog.
   */
  _log(action, target, detail) {
    const timeStr = new Date().toISOString();
    this.changelog.push({
      action,
      target,
      detail,
      time: timeStr,
    });

    if (this.logFile) {
      try {
        const timeFmt = timeStr.replace('T', ' ').slice(0, 19);
        const logLine = `[${timeFmt}] [${action.toUpperCase().padEnd(8)}] ${target} — ${detail}\n`;
        fs.appendFileSync(this.logFile, logLine, 'utf8');
      } catch {}
    }
  }

  /**
   * Appends an action entry to the session changelog.
   */
  logAction(action, target, detail) {
    this._log(action, target, detail);
  }

  // ---------------------------------------------------------------------------
  // Public CRUD API
  // ---------------------------------------------------------------------------

  /**
   * Creates a new file inside the sandbox.
   * Throws if the file already exists.  Parent directories are created as needed.
   */
  create(relativePath, content) {
    const abs = this._resolveSafe(relativePath);
    if (fs.existsSync(abs)) {
      throw new Error(`File already exists: ${relativePath}`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    this._log('create', relativePath, `Created (${Buffer.byteLength(content)} bytes)`);
    return abs;
  }

  /**
   * Reads a file inside the sandbox.  Throws if it doesn't exist.
   */
  read(relativePath) {
    const abs = this._resolveSafe(relativePath);
    if (!fs.existsSync(abs)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    const content = fs.readFileSync(abs, 'utf8');
    this._log('read', relativePath, `Read (${Buffer.byteLength(content)} bytes)`);
    return content;
  }

  /**
   * Overwrites an existing file.
   * Requires `confirm === true` — without it the call throws, preventing
   * silent/accidental data loss.
   */
  update(relativePath, newContent, confirm = false) {
    const abs = this._resolveSafe(relativePath);
    if (!fs.existsSync(abs)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    if (confirm !== true) {
      throw new Error(
        `Update blocked: confirm flag is not set. ` +
        `Pass confirm=true to allow overwriting "${relativePath}".`
      );
    }
    fs.writeFileSync(abs, newContent, 'utf8');
    this._log('update', relativePath, `Overwritten (${Buffer.byteLength(newContent)} bytes)`);
    return abs;
  }

  /**
   * Deletes an existing file.
   * Requires `confirm === true` — same safeguard as `update`.
   */
  delete(relativePath, confirm = false) {
    const abs = this._resolveSafe(relativePath);
    if (!fs.existsSync(abs)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    if (confirm !== true) {
      throw new Error(
        `Delete blocked: confirm flag is not set. ` +
        `Pass confirm=true to allow deleting "${relativePath}".`
      );
    }
    fs.unlinkSync(abs);
    this._log('delete', relativePath, 'Deleted');
    return abs;
  }

  /**
   * Lists entries (files + directories) inside a sandbox sub-directory.
   *
   * @param {string} [subDir='.'] – relative sub-directory to list
   * @returns {Array<{name: string, type: string}>}
   */
  list(subDir = '.') {
    const abs = this._resolveSafe(subDir);
    if (!fs.existsSync(abs)) {
      throw new Error(`Directory not found: ${subDir}`);
    }
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${subDir}`);
    }
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    this._log('list', subDir, `Listed ${entries.length} entries`);
    return entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file',
    }));
  }

  /**
   * Returns the full in-memory changelog for the current session.
   * @returns {Array<{action: string, target: string, detail: string, time: string}>}
   */
  getChangelog() {
    return this.changelog;
  }
}

module.exports = { FileOps };
