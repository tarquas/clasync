const Path = require('path');

const ClasyncError = {
  throw(err, opts) {
    const {title, exit, when} = typeof opts === 'string' ? {title: opts} : opts || {};
    const at = when || new Date();
    console.log(`\n\n--- ${title || 'THROWN'} --- ${new Date(at).toISOString()}`);
    console.log(this.getStack(err));
    if (exit != null) process.exit(exit);
  },

  getStack(err) {
    if (!err) return err;
    if (err.stack) return this.prettyStack(err);
    return err.message || err;
  },

  getModuleShortPath(module) {
    const existing = module[this.stackShortPath];
    if (existing) return existing;

    const paths = module.paths;
    let shortPath = null;

    for (const path of paths) {
      if (module.filename.substr(0, path.length + 1) === `${path}/`) {
        shortPath = `${module.filename.substr(path.length + 1)}`;
        break;
      }
    }

    if (!shortPath) {
      const mainDir = Path.dirname(require.main ? require.main.filename : process.cwd());
      const path = Path.relative(mainDir, module.filename);
      shortPath = path.charAt(0) === '.' ? path : `./${path}`;
    }

    module[this.stackShortPath] = shortPath;
    return shortPath;
  },

  prettyStackPointGlobal(line) {
    const [, path, row, col] = line.match(this.rxStackPointGlobal) || [];
    if (!path) return null;
    const module = require.cache[path];
    const newPath = module ? this.getModuleShortPath(module) : path;
    const newLine = `${this.prettyStackPfx}--- ${newPath}:${row}:${col}`;
    return newLine;
  },

  prettyStackPointMethod(line) {
    const [, method, path, row, col] = line.match(this.rxStackPointMethod) || [];
    if (!path) return null;
    const module = require.cache[path];
    const newPath = module ? this.getModuleShortPath(module) : path;
    const newLine = `${this.prettyStackPfx}${method} --- ${newPath}:${row}:${col}`;
    return newLine;
  },

  prettyStackPointAt(line) {
    const [, method] = line.match(this.rxStackPointAt) || [];
    const newLine = `${this.prettyStackPfx}${method}`;
    return newLine;
  },

  prettyStack(err) {
    const [head, ...trace] = err.stack.split('\n');
    const newStack = [head, '-----'];

    for (const line of trace) {
      const newLine = (
        this.prettyStackPointMethod(line) ||
        this.prettyStackPointGlobal(line) ||
        this.prettyStackPointAt(line) ||
        line
      );
       
      newStack.push(newLine);
    }

    return newStack.join('\n');
  },

  rxStackPointGlobal: /^    at (.+):(\d+):(\d+)$/,
  rxStackPointMethod: /^    at (.+) \((.+):(\d+):(\d+)\)$/,
  rxStackPointAt: /^    at (.+)$/,
  stackShortPath: Symbol('Clasync.stackShortPath'),
  prettyStackPfx: ' > '
};

module.exports = ClasyncError;
