module.exports = {
  private(fields) {
    const res = Object.create(null);

    for (const [field, value] of this.entries(fields)) {
      if (typeof value !== 'function') res[field] = value;
      else res[field] = value.call.bind(value);
    }

    return res;
  },

  echo(arg) {
    return arg;
  },

  async echoAsync(arg) {
    return arg;
  },

  null() {
    return null;
  },

  async nullAsync() {
    return null;
  },

  not(arg) {
    return !arg;
  },

  async notAsync(arg) {
    return !arg;
  },

  bound() {
    return this;
  },

  async boundAsync() {
    return this;
  },

  numSort(a, b) {
    return a - b;
  },

  sum(a, b) {
    return a + b;
  },

  safeSum(a, b) {
    return (+a || 0) + (+b || 0);
  },

  prod(a, b) {
    return a * b;
  },

  safeProd(a, b) {
    return (+a || 1) * (+b || 1);
  },

  max(a, b) {
    return a > b ? a : b;
  },

  min(a, b) {
    return a < b ? a : b;
  },

  int32(a) {
    return a | 0;
  },

  int(a) {
    return parseInt(a);
  },

  //

  anyInstanceOf(obj, types) {
    for (const type of types) {
      if (obj instanceof type) return true;
    }

    return false;
  },

  iterableTypes: [Array, Map, Set],

  *objectKeys(obj, inherited) {
    if (inherited) {
      for (const key in obj) {
        yield key;
      }
    } else {
      for (const key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) {
          yield key;
        }
      }
    }
  },

  keys(obj, inherited) {
    if (this.anyInstanceOf(obj, this.iterableTypes)) return obj.keys();
    return this.objectKeys(obj, inherited);
  },

  *objectKeyValues(obj, inherited) {
    if (inherited) {
      for (const key in obj) {
        const nw = Object.create(null);
        nw[key] = obj[key];
        yield nw;
      }
    } else {
      for (const key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) {
          const nw = Object.create(null);
          nw[key] = obj[key];
          yield nw;
        }
      }
    }
  },

  keyValuesByEntries$([k, v]) {
    const nw = Object.create(null);
    nw[k] = v;
    return nw;
  },

  keyValues(obj, inherited) {
    if (this.anyInstanceOf(obj, this.iterableTypes)) return this.mapIter(obj.entries(), this.keyValuesByEntries);
    return this.objectKeyValues(obj, inherited);
  },

  *objectEntries(obj, inherited) {
    if (inherited) {
      for (const key in obj) {
        yield [key, obj[key]];
      }
    } else {
      for (const key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) {
          yield [key, obj[key]];
        }
      }
    }
  },

  entries(obj, inherited) {
    if (this.anyInstanceOf(obj, this.iterableTypes)) return obj.entries();
    return this.objectEntries(obj, inherited);
  },

  *objectValues(obj, inherited) {
    if (inherited) {
      for (const key in obj) {
        yield obj[key];
      }
    } else {
      for (const key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) {
          yield obj[key];
        }
      }
    }
  },

  values(obj, inherited) {
    if (this.anyInstanceOf(obj, this.iterableTypes)) return obj.values();
    return this.objectValues(obj, inherited);
  },

  append(array, ...tails) {
    for (const tail of tails) {
      if (this.iteratorObj(tail)) {
        for (const sub of this.chunkIter(tail, 1000)) {
          Array.prototype.push.apply(array, sub);
        }
      } else {
        Array.prototype.push.call(array, tail);
      }
    }

    return array;
  },

  async appendAsync(array, ...tails) {
    for (const tail of tails) {
      if (this.asyncIteratorObj(tail)) {
        for await (const sub of tail) {
          Array.prototype.push.call(array, sub);
        }
      } else {
        Array.prototype.push.call(array, tail);
      }
    }

    return array;
  },

  *flattenIter(...iters) {
    for (const iter of iters) {
      if (iter == null) {
        //
      } else if (this.iteratorObj(iter)) {
        for (const sub of iter) {
          yield sub;
        }
      } else {
        yield iter;
      }
    }
  },

  async *flattenAsync(...iters) {
    for (const iter of iters) {
      if (iter == null) {
        //
      } else if (this.asyncIteratorObj(iter)) {
        for await (const sub of iter) {
          yield sub;
        }
      } else {
        yield iter;
      }
    }
  },

  *flattenDeepIter(depth, ...iters) {
    for (const iter of iters) {
      if (this.iteratorObj(iter)) {
        for (const sub of iter) {
          if (depth) yield* this.flattenDeepIter(depth - 1, sub);
          else yield sub;
        }
      } else {
        yield iter;
      }
    }
  },

  async *flattenDeepAsync(depth, ...iters) {
    for (const iter of iters) {
      if (this.asyncIteratorObj(iter)) {
        for await (const sub of iter) {
          if (depth) yield* this.flattenDeepAsync(depth - 1, sub);
          else yield sub;
        }
      } else {
        yield iter;
      }
    }
  },

  xorIter(iter1, iter2) {
    const xor = new Set();

    for (const key of this.flattenIter(iter1, iter2)) {
      if (xor.has(key)) xor.delete(key);
      else xor.add(key);
    }

    return xor;
  },

  async xorAsync(iter1, iter2) {
    const xor = new Set();

    for await (const key of this.flattenAsync(iter1, iter2)) {
      if (xor.has(key)) xor.delete(key);
      else xor.add(key);
    }

    return xor;
  },

  //

  keyValueString([k, v]) {
    return `${k}: ${v}`;
  },

  string$(a) {
    if (typeof a === 'string') return a;
    if (a == null) return String(a);
    if (a instanceof Date) return a.toISOString();

    if (a instanceof Set) a = Array.from(a);
    else if (a instanceof Map) a = Array.from(a).map(this.keyValueString);

    if (a instanceof Array) return a.join(', ');
    if (typeof a === 'object') return this.mapArray(this.entries(a), this.keyValueString).join(', ');
    return a.toString();
  },

  stringIter(iter) {
    let res = '';

    for (const item of iter) {
      res += this.string$(item);
    }

    return res;
  },

  async stringAsync(iter) {
    let res = '';

    for await (const item of iter) {
      res += this.string$(item);
    }

    return res;
  },

  jsonString(obj, space, opts = {}) {
    const objs = new WeakMap();

    const replacer = opts.rawReplacer || ((k, v) => {
      if (opts.replacer) v = opts.replacer.call(this, k, v);
      if (!v || typeof v !== 'object') return v;

      if (objs.has(v)) {
        if (opts.circular) return opts.circular.call(this, k, v);
        return `[Circular ${this.$.getDef(v, 'constructor', 'name', '<null>')}]`;
      }

      objs.set(v, true);
      if (v instanceof Set) return Array.from(v);
      if (v instanceof Map) return this.fromEntries(Array.from(v));

      if (v instanceof WeakMap) {
        if (opts.special) return opts.special.call(this, k, v);
        return `[${this.$.getDef(v, 'constructor', 'name', '<null>')}]`;
      }

      if (v instanceof RegExp) {
        return `[RegExp: ${JSON.stringify(v.source)} ${v.flags}]`;
      }

      return v;
    });

    return JSON.stringify(obj, replacer, space);
  },

  jsonParse(json, def) {
    try {
      return JSON.parse(json);
    } catch (err) {
      if (err.constructor === SyntaxError) return def;
      throw err;
    }
  },

  funcSort$(func, ...rest) {
    return (a, b) => {
      const A = func.call(this, a, ...rest);
      const B = func.call(this, b, ...rest);
      const res = A > B ? 1 : A < B ? -1 : 0;
      return res;
    }
  },

  objSort$(...walk) {
    return (a, b) => {
      const A = this.get(a, ...walk);
      const B = this.get(b, ...walk);
      const res = A > B ? 1 : A < B ? -1 : 0;
      return res;
    };
  },

  objFuncSort$(...walk) {
    return (a, b) => {
      const A = this.get(func.call(this, a), ...walk);
      const B = this.get(func.call(this, b), ...walk);
      const res = A > B ? 1 : A < B ? -1 : 0;
      return res;
    };
  },

  insortDepth: Symbol('insortDepth'),
  insortMag: Symbol('insortMag'),

  walkInsort(obj, field, key, create) {
    let root = !obj ? field : obj[field];

    if (!root || !root[this.insortDepth]) {
      if (create) {
        let {mag} = create;
        mag = mag != null ? +mag : 3;
        if (Number.isNaN(mag) || mag < 0) throw new Error('insort: bad mag value');
        root = $.make();
        if (obj) obj[field] = root;
        root[this.insortDepth] = 1;
        root[this.insortMag] = mag;
      } else return;
    }

    const mag = root[this.insortMag];
    if (key < 0) throw new Error('insort key can not be negative');
    if (typeof key !== 'bigint' && !Number.isInteger(key)) throw new Error('insort key must be integer');
    const hex = key.toString(16);
    const l = hex.length;
    let depth = ((l - 1) >> mag) + 1;
    let d = root[this.insortDepth];
    let deeper = depth - d;

    if (deeper > 0) {
      let p = root;

      if (create) {
        if (this.hasKeys(p)) {
          while (deeper--) {
            const newRoot = $.make();
            newRoot[this.insortDepth] = ++d;
            newRoot[this.insortMag] = mag;
            newRoot['0'] = p;
            p = newRoot;
          }
        } else {
          const newRoot = $.make();
          newRoot[this.insortDepth] = depth;
          newRoot[this.insortMag] = mag;
          p = newRoot;
        }
      } else return;

      root = p;
      if (obj) obj[field] = p;
    } else if (deeper < 0) while (deeper++) {
      root = root['0'];
    }

    const dig = 1 << mag;
    const mask = dig - 1;
    let left = ((l + mask) & mask) + 2;
    const grouped = this.chunkByIter(hex, () => !(--left) && (left = dig));
    const mapped = this.mapIter(grouped, group => parseInt(group.join(''), 16));

    let at, idx, p = root, ctx, dim = [];

    for (idx of mapped) {
      ctx = p;
      at = p[idx];
      const d = --depth;

      if (d && !at) {
        if (create) {
          p[idx] = at = $.make();
          at[this.insortDepth] = d;
          at[this.insortMag] = mag;
        } else return;
      }

      p = at;
      dim.push(idx);
    }

    return {root, ctx, idx, dim};
  },

  *partialInsortEntries(insort, pfx) {
    const mag = insort[this.insortMag];
    const depth = insort[this.insortDepth];
    if (!depth) throw new Error('insort: not compatible');

    if (depth > 1) {
      const nextDepth = depth - 1;

      for (const [k, v] of this.entries(insort)) {
        if (!v || v[this.insortDepth] !== nextDepth) throw new Error('insort: malformed');
        yield* this.partialInsortEntries(v, [...pfx, (+k).toString(16).padStart(mag, '0')]);
      }
    } else {
      for (const [k, v] of this.entries(insort)) {
        const idx = BigInt(['0x', ...pfx, (+k).toString(16).padStart(mag, '0')].join(''));
        yield [idx, v];
      }
    }
  },

  *insortEntries(insort) {
    yield* this.partialInsortEntries(insort, []);
  },

  //TODO: insortEntries(insort, from, to)

  get(object, ...walk) {
    let p = object, pp, ps;

    for (const step of walk) {
      if (p == null) return p;
      if (step == null) return p;

      if (typeof step === 'bigint' || step.ins) {
        if (!pp) throw new Error('insort must have root object');
        const got = this.walkInsort(pp, ps, step.ins || step);
        if (!got) return null;
        pp = got.ctx; ps = got.idx;
      } else {
        pp = p; ps = step;
      }

      p = pp[ps];
    }

    return p;
  },

  getDef(object, ...walk) {
    let p = object, pp, ps;
    const value = walk.pop();

    for (const step of walk) {
      if (p == null) return value;
      if (step == null) return p;

      if (typeof step === 'bigint' || step.ins) {
        if (!pp) throw new Error('insort must have root object');
        const got = this.walkInsort(pp, ps, step.ins || step);
        if (!got) return value;
        pp = got.ctx; ps = got.idx;
      } else {
        pp = p; ps = step;
      }

      if (!(ps in pp)) return value;
      p = pp[ps];
    }

    return p;
  },

  ensureEx(object, ...walk) {
    let p = object, pp, ps, step;
    if (p == null) return p;
    let n = null, pr = null;
    const l = walk.length;
    const ll = l - 1;

    for (let i = 0; i < l; i++) {
      step = walk[i];

      if (typeof step === 'bigint' || step.ins) {
        if (!pp) throw new Error('insort must have root object');
        const got = this.walkInsort(pp, ps, step.ins || step, {mag: 3});
        pp = got.ctx; ps = got.idx;
      } else {
        pp = p; ps = step;
      }

      if (i === ll) break;
      const n = pp[ps];
      if (n == null) pp[ps] = p = typeof walk[i+1] === 'number' ? [] : this.make();
      else p = n;
    }

    return {ctx: pp, idx: ps};
  },

  ensure(object, ...walk) {
    const {ctx} = this.ensureEx(object, ...walk);
    return ctx;
  },

  set(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const {ctx, idx} = this.ensureEx(object, ...walk);
    ctx[idx] = value;
    return ctx;
  },

  setDef(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const {ctx, idx} = this.ensureEx(object, ...walk);
    if (!(idx in ctx)) { ctx[idx] = value; return value; }
    return ctx[idx];
  },

  setAdd(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const {ctx: p, idx: last} = this.ensureEx(object, ...walk);

    if (last in p) {
      if (value instanceof Array) this.append(p[last], value);
      else if (value instanceof Set) value.forEach(item => p[last].add(item));
      else if (value instanceof Map) value.forEach((v, k) => p[last].set(k, v));
      else if (typeof value === 'object') Object.assign(p[last], value);
      else if (typeof value === 'boolean') p[last] |= value;
      else if (typeof value === 'function') value(p[last], p, last);
      else if (typeof value === 'undefined') delete p[last];
      else p[last] += value;
    } else {
      if (value instanceof Array) p[last] = [...value];
      else if (value instanceof Set) p[last] = new Set(value);
      else if (value instanceof Map) p[last] = new Map(value);
      else if (typeof value === 'object') p[last] = this.make(value);
      else if (typeof value === 'function') value(p[last], p, last);
      else if (typeof value === 'undefined') {}
      else p[last] = value;
    }

    return p[last];
  },

  setPush(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const {ctx: p, idx: last} = this.ensureEx(object, ...walk);
    let arr = p[last];
    if (!(arr instanceof Array)) p[last] = arr = [value];
    else arr.push(value);
    return arr;
  },

  setUnshift(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const {ctx: p, idx: last} = this.ensureEx(object, ...walk);
    let arr = p[last];
    if (!(arr instanceof Array)) p[last] = arr = [value];
    else arr.unshift(value);
    return arr;
  },

  setExtend(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const {ctx: p, idx: last} = this.ensureEx(object, ...walk);
    let obj = p[last];
    if (!(typeof obj === 'object')) p[last] = obj = this.$.make(value);
    else Object.assign(obj, value);
    return obj;
  },

  setDefaults(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const {ctx: p, idx: last} = this.ensureEx(object, ...walk);
    let obj = p[last];
    if (!(typeof obj === 'object')) p[last] = obj = this.$.make(value);
    else this.defaults(obj, value);
    return obj;
  },

  make(...parts) {
    const result = Object.create(null);

    for (const part of parts) {
      if (!part) {
        //
      } else if (this.iteratorObj(part)) {
        for (const sub of part) Object.assign(result, sub);
      } else {
        Object.assign(result, part);
      }
    }

    return result;
  },

  async makeAsync(...parts) {
    const result = Object.create(null);

    for (const part of parts) {
      if (!part) {
        //
      } else if (this.asyncIteratorObj(part)) {
        for await (const sub of part) Object.assign(result, sub);
      } else {
        Object.assign(result, part);
      }
    }

    return result;
  },

  makeObject(...parts) {
    return this.$.make(...parts);
  },

  objectOrUndefined: {object: 1, undefined: 1},

  uniqKeys(what, def) {
    const keys = this.make(this.mapIter(what, i => (
      i instanceof Array ? this.make(i.map(j => ({[j]: def}))) :
      typeof i in this.objectOrUndefined ? i : ({[i]: def})
    )));

    return keys;
  },

  accumulate(acc, obj) {
    if (obj == null) return acc;

    if (obj instanceof Array) {
      if (acc.length == null) acc.length = 0;
      this.append(acc, obj);
    } else if (obj instanceof Set) {
      if (acc.add) obj.forEach(item => acc.add(item));
      else this.append(acc, obj.values);
    } else if (obj instanceof Map) {
      if (acc.set) obj.forEach((v, k) => acc.set(k, v));
      else Object.assign(acc, this.fromEntries(Array.from(obj.entries())));
    } else if (typeof obj === 'object') {
      Object.assign(acc, obj);
    } else if (typeof obj === 'function') {
      Object.assign(acc, obj.call(this, acc));
    } else {
      Object.assign(acc, {[obj]: true});
    }

    return acc;
  },

  chunk(array, length) {
    const chunks = this.range(0, array.length, length);
    this.maps(chunks, from => array.slice(from, from + length));
    return chunks;
  },

  *chunkIter(iter, length) {
    let chunk = [];
    let left = length;

    for (const item of iter) {
      if (left > 0) {
        chunk.push(item);
        left--;
      } else {
        left = length - 1;
        yield chunk;
        chunk = [item];
      }
    }

    if (chunk.length) yield chunk;
  },

  async *chunkAsync(iter, length) {
    let chunk = [];
    let left = length;

    for await (const item of iter) {
      if (left > 0) {
        chunk.push(item);
        left--;
      } else {
        left = length - 1;
        yield chunk;
        chunk = [item];
      }
    }

    if (chunk.length) yield chunk;
  },

  *chunkByIter(iter, func) {
    let cur = [];
    let idx = 0;

    for (const item of iter) {
      if (func.call(this, item, cur, idx++, iter)) {
        yield cur;
        cur = [item];
      } else {
        cur.push(item);
      }
    }

    if (cur.length) yield cur;
  },

  async *chunkByAsync(iter, func) {
    let cur = [];
    let idx = 0;

    for await (const item of iter) {
      if (await func.call(this, item, cur, idx++, iter)) {
        yield cur;
        cur = [item];
      } else {
        cur.push(item);
      }
    }

    if (cur.length) yield cur;
  },

  async *chunkByTimeAsync(iter, timeMsec, maxSize) {
    let start = process.hrtime.bigint();
    const time = BigInt(timeMsec * 1e6);

    const func = (item, cur) => {
      if (maxSize && cur.length >= maxSize) return true;
      const now = process.hrtime.bigint();
      if (now - start > time) { start = now; return true; }
      return false;
    };

    yield* this.chunkByAsync(iter, func);
  },

  /*findIter(iter, condFn) {
    if (typeof condFn === 'function') {
      for (const item of iter) {
        if ()
      }
  },*/

  *stopIter(iter, condFn) {
    for (const item of iter) {
      if (condFn.call(this, item, iter)) break;
      yield item;
      if (condFn.call(this, item, iter)) break;
    }
  },

  async *stopAsync(iter, condFn) {
    for await (const item of iter) {
      if (condFn.call(this, item, iter)) break;
      yield item;
      if (condFn.call(this, item, iter)) break;
    }
  },

  *partialIter(iter, arg, ...items) {
    let {limit} = arg;

    if (items.length) {
      yield* items;
      limit -= items.length;
      arg.idx = items.length;
      if (limit <= 0) return;
    } else {
      arg.idx = 0;
    }

    try {
      while (limit--) {
        const {value, done} = iter.next();
        if (done) { iter = null; return; }
        yield value;
        arg.idx++;
      }
    } finally {
      if (arg.end) arg.end.call(this, arg.idx, arg.limit);
    }
  },

  async *partialAsync(iter, arg, ...items) {
    let {limit} = arg;

    if (items.length) {
      yield* items;
      limit -= items.length;
      arg.idx = items.length;
      if (limit <= 0) return;
    } else {
      arg.idx = 0;
    }

    try {
      while (limit--) {
        const {value, done} = await iter.next();
        if (done) { iter = null; return; }
        yield value;
        arg.idx++;
      }
    } finally {
      if (arg.end) arg.end.call(this, arg.idx, arg.limit);
    }
  },

  *chunkIterIter(from, limit) {
    let iter = this.iteratorObj(from, true);
    let skip = 0;
    const arg = {limit};

    for (const item of iter) {
      if (skip--) continue;
      yield this.partialIter(iter, arg, item);
      skip = limit - arg.idx;
    }
  },

  async *chunkAsyncAsync(from, limit) {
    let iter = this.asyncIteratorObj(from, true);
    let skip = 0;
    const arg = {limit};

    for await (const item of iter) {
      if (skip--) continue;
      const wait = new Promise((ok) => { arg.end = ok; });
      yield this.partialAsync(iter, arg, item);
      await wait;
      skip = limit - arg.idx;
    }
  },

  *sliceIter(iter, skip, limit) {
    if (limit == null) {
      for (const item of iter) {
        if (skip) {
          skip--;
        } else {
          yield item;
        }
      }
    } else {
      for (const item of iter) {
        if (skip) {
          skip--;
        } else if (limit--) {
          yield item;
        } else return;
      }
    }
  },

  async *sliceAsync(iter, skip, limit) {
    if (limit == null) {
      for await (const item of iter) {
        if (skip) {
          skip--;
        } else {
          yield item;
        }
      }
    } else {
      for await (const item of iter) {
        if (skip) {
          skip--;
        } else if (limit--) {
          yield item;
        } else return;
      }
    }
  },

  last(iter, count) {
    const buf = [];

    for (const item of iter) {
      buf.push(item);
      if (buf.length > count) buf.shift();
    }

    return buf;
  },

  async lastAsync(iter, count) {
    const buf = [];

    for await (const item of iter) {
      buf.push(item);
      if (buf.length > count) buf.shift();
    }

    return buf;
  },

  *cutLastIter(iter, cut) {
    if (!cut) { yield* iter; return; }
    const buf = [];

    for (const item of iter) {
      buf.push(item);
      if (buf.length > cut) yield buf.shift();
    }
  },

  async *cutLastAsync(iter, cut) {
    if (!cut) { yield* iter; return; }
    const buf = [];

    for await (const item of iter) {
      if (buf.length >= cut) yield buf.shift();
      buf.push(item);
    }
  },

  *sliceRightIter(iter, skip, limit) {
    const skipped = skip ? this.cutLastIter(iter, skip) : iter;
    if (!limit) { yield* skipped; return; }
    yield* this.last(skipped, limit);
  },

  async *sliceRightAsync(iter, skip, limit) {
    const skipped = skip ? this.cutLastAsync(iter, skip) : iter;
    if (!limit) { yield* skipped; return; }
    yield* await this.lastAsync(skipped, limit);
  },

  clone(obj) {
    if (!obj) return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.slice();
    if (obj instanceof Map) return new Map(obj);
    if (obj instanceof Set) return new Set(obj);
    if (typeof obj === 'object') return this.make(obj);
    return obj;
  },

  cloneDeep(obj) {
    if (!obj) return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(obj => this.cloneDeep(obj));
    if (obj instanceof Map) return new Map(obj);
    if (obj instanceof Set) return new Set(obj);

    if (typeof obj === 'object') return this.make(
      this.mapIter(this.entries(obj), ([k, v]) => ({[k]: this.cloneDeep(v)}))
    );

    return obj;
  },

  defaults(obj, ...defs) {
    for (const def of defs) {
      if (!def) {
        //
      } if (this.iteratorObj(def)) {
        for (const sub of def) for (const [k, v] of this.entries(sub)) {
          if (!(k in obj)) obj[k] = v;
        }
      } else {
        for (const [k, v] of this.entries(def)) {
          if (!(k in obj)) obj[k] = v;
        }
      }
    }

    return obj;
  },

  async defaultsAsync(obj, ...defs) {
    for (const def of defs) {
      if (!def) {
        //
      } if (this.asyncIteratorObj(def)) {
        for await (const sub of def) for (const [k, v] of this.entries(sub)) {
          if (!(k in obj)) obj[k] = v;
        }
      } else {
        for (const [k, v] of this.entries(def)) {
          if (!(k in obj)) obj[k] = v;
        }
      }
    }

    return obj;
  },

  extend(obj, ...exts) {
    for (const ext of exts) {
      if (!ext) {
        //
      } else if (this.iteratorObj(ext)) {
        for (const sub of ext) Object.assign(obj, sub);
      } else {
        Object.assign(obj, ext);
      }
    }

    return obj;
  },

  async extendAsync(obj, ...exts) {
    for (const ext of exts) {
      if (!ext) {
        //
      } else if (this.asyncIteratorObj(ext)) {
        for await (const sub of ext) Object.assign(obj, sub);
      } else {
        Object.assign(obj, ext);
      }
    }

    return obj;
  },

  flatten(array) {
    if (!this.iteratorObj(array)) return array;
    if (array.flat) return array.flat();
    const result = [];
    for (const sub of array) this.append(result, sub);
    return result;
  },

  flattenDeep(array) {
    if (!this.iteratorObj(array)) return array;
    const result = [];
    for (const sub of array) this.append(result, this.flattenDeep(sub));
    return result;
  },

  fromEntries(pairs) {
    if (Object.fromEntries) return Object.fromEntries(pairs);
    const result = this.make(this.mapIter(pairs, ([k, v]) => ({[k]: v})));
    return result;
  },

  fromPairs(pairs) { return this.fromEntries(pairs); },

  *forkOne(from, arg, i) {
    const {buf, idxs, limit} = arg;
    let value, done;

    try {
      while (true) {
        const c = idxs[i]++;

        if (c >= buf.length) {
          if (arg.done) return;
          ({value, done} = from.next());
          if (done) { arg.done = true; return; }
          const length = buf.push(value);
          if (limit && length > limit) throw new Error('limitExceeded');
        } else {
          value = buf[c];
        }

        if (!c && !--arg.pend) {
          const count = idxs.length;
          let zero = 0;
          buf.shift();

          for (let j = 0; j < count; j++) {
            if (!--idxs[j]) zero++;
          }

          arg.pend = zero;
        }

        yield value;
      }
    } catch (err) {
      if (!done && from.throw) {
        from.throw(err);
        done = true;
      }

      throw err;
    } finally {
      if (!done && from.return) from.return();
    }
  },

  forkIter(from, count, limit) {
    const iters = Array(count);
    const iter = this.iteratorObj(from, true);

    if (iter !== from) {
      if (iter && iter.return) iter.return();
      return iters.fill(from);
    }

    const arg = {
      buf: [],
      limit,
      idxs: Array(count),
      pend: count
    };

    for (let i = 0; i < count; i++) {
      arg.idxs[i] = 0;
      iters[i] = this.forkOne(from, arg, i);
    }

    return iters;
  },

  async *forkOneAsync(from, arg, i) {
    const {buf, idxs, limit} = arg;
    let value, done;

    try {
      while (true) {
        const c = idxs[i]++;

        if (c >= buf.length) {
          if (arg.done) return;
          ({value, done} = await from.next());
          if (done) { arg.done = true; return; }
          const length = buf.push(value);
          if (limit && length > limit) throw new Error('limitExceeded');
        } else {
          value = buf[c];
        }

        if (!c && !--arg.pend) {
          const count = idxs.length;
          let zero = 0;
          buf.shift();

          for (let j = 0; j < count; j++) {
            if (!--idxs[j]) zero++;
          }

          arg.pend = zero;
        }

        yield value;
      }
    } catch (err) {
      if (!done && from.throw) {
        await from.throw(err);
        done = true;
      }

      throw err;
    } finally {
      if (!done && from.return) await from.return();
    }
  },

  forkAsync(from, count, limit) {
    const iters = Array(count);
    const iter = this.asyncIteratorObj(from, true);

    if (iter !== from) {
      if (iter && iter.return) iter.return();
      return iters.fill(from);
    }

    const arg = {
      buf: [],
      limit,
      idxs: Array(count),
      pend: count
    };

    for (let i = 0; i < count; i++) {
      arg.idxs[i] = 0;
      iters[i] = this.forkOneAsync(from, arg, i);
    }

    return iters;
  },

  iterator(iter, call) {
    let func = iter[Symbol.iterator];
    if (!func) return null;
    if (call) return func.call(iter);
    return func;
  },

  asyncIterator(iter, call) {
    let func = iter[Symbol.asyncIterator];
    if (!func) func = iter[Symbol.iterator];
    if (!func) return null;
    if (call) return func.call(iter);
    return func;
  },

  iteratorAsync(iter, call) { // OLD:
    return this.asyncIterator(iter, call);
  },

  iteratorObj(iter, call) {
    if (!iter || typeof iter !== 'object') return null;
    return this.iterator(iter, call);
  },

  asyncIteratorObj(iter, call) {
    if (!iter || typeof iter !== 'object') return null;
    return this.asyncIterator(iter, call);
  },

  iteratorObjAsync(iter, call) { // OLD:
    return this.asyncIteratorObj(iter, call);
  },

  generator(gen, ...args) {
    if (typeof gen !== 'function') return null;
    const iter = gen.call(this, ...args);
    if (!this.iterator(iter)) return null;
    return iter;
  },

  asyncGenerator(gen, ...args) {
    if (typeof gen !== 'function') return null;
    const iter = gen.call(this, ...args);
    if (!this.asyncIterator(iter)) return null;
    return iter;
  },

  iterable(itrb, ...args) {
    const iter = this.iterator(itrb, true);
    if (!iter) return this.generator(itrb, ...args);
    if (iter === itrb) throw new Error('not iterable');
    return iter;
  },

  asyncIterable(itrb, ...args) {
    const iter = this.asyncIterator(itrb, true);
    if (!iter) return this.asyncGenerator(itrb, ...args);
    if (iter === itrb) throw new Error('not iterable');
    return iter;
  },

  arrayIter(iter) {
    if (iter == null) return [];
    if (!this.iteratorObj(iter)) return [iter];
    return Array.from(iter);
  },

  array(iter) { return this.arrayIter(iter); },

  async arrayAsync(iter) {
    if (iter == null) return [];
    if (!this.asyncIteratorObj(iter)) return [iter];
    const arr = [];

    for await (const item of iter) {
      arr.push(item);
    }

    return arr;
  },

  groupBy(array, func) {
    const groups = Array.from(this.mapIter(array, func));
    const result = this.inverts(groups, array instanceof Array ? array : Array.from(array));
    return result;
  },

  hasKeys(obj) {
    if (!obj) return false;
    for (const key in obj) return true;
    return false;
  },

  numKeys(obj) {
    let n = 0;
    for (const key in obj) n++;
    return n;
  },

  firstKey(obj) {
    if (!obj) return;

    if (this.anyInstanceOf(obj, this.iterableTypes)) {
      for (const item of obj.keys()) return item;
    }

    const iter = this.iterator(obj, true);

    if (iter) {
      for (const item of iter) {
        return item instanceof Array ? value[0] : value;
      }
    }

    for (const key in obj) return key;
  },

  firstValue(obj) {
    if (!obj) return;

    if (this.anyInstanceOf(obj, this.iterableTypes)) {
      for (const item of obj.values()) return item;
    }

    const iter = this.iterator(obj, true);

    if (iter) {
      for (const item of iter) {
        return item instanceof Array ? value[1] : value;
      }
    }

    for (const key in obj) return obj[key];
  },

  firstEntry(obj) {
    if (!obj) return;

    if (this.anyInstanceOf(obj, this.iterableTypes)) {
      for (const item of obj.entries()) return item;
    }

    const iter = this.iterator(obj, true);

    if (iter) {
      for (const item of iter) {
        return value;
      }
    }

    for (const key in obj) return [key, obj[key]];
    return [];
  },

  invert(obj) {
    const result = this.make(this.mapObject(obj, (k, v) => ({[v]: k})));
    return result;
  },

  inverts(obj, map) {
    const [ents1, ents2] = this.forkIter(this.entries(obj), 2);

    const groups = this.make(this.mapIter(ents1,
      ([k, v]) => v instanceof Array ? this.invert(v) : ({[v]: true})
    ));

    this.mapsValues(groups, () => []);

    for (const [k, v] of ents2) {
      const h = map ? map[k] : k;

      if (this.iteratorObj(v)) {
        for (const g of v) {
          groups[g].push(h);
        }
      } else {
        groups[v].push(h);
      }
    }

    return groups;
  },

  *sepIter(iter, sep) {
    let next = false;
    const sepIterb = typeof sep === 'function' || this.iteratorObj(sep);

    if (sepIterb) {
      for (const item of iter) {
        const sepIter = this.iterable(sep);
        if (next) yield* sepIter; else next = true;
        yield item;
      }
    } else {
      for (const item of iter) {
        if (next) yield sep; else next = true;
        yield item;
      }
    }
  },

  async *sepAsync(iter, sep) {
    let next = false;
    const sepIterb = typeof sep === 'function' || this.asyncIteratorObj(sep);

    if (sepIterb) {
      for await (const item of iter) {
        const sepIter = this.asyncIterable(sep);
        if (next) yield* sepIter; else next = true;
        yield item;
      }
    } else {
      for await (const item of iter) {
        if (next) yield sep; else next = true;
        yield item;
      }
    }
  },

  *mapIter(iter, func) {
    if (func == null) {
      for (const item of iter) {
        yield item;
      }
    } else if (typeof func == 'function') {
      let idx = 0;

      for (const item of iter) {
        yield func.call(this, item, idx++, iter);
      }
    } else {
      for (const item of iter) {
        yield item[func];
      }
    }
  },

  async *mapAsync(iter, func) {
    if (func == null) {
      for await (const item of iter) {
        yield item;
      }
    } else if (typeof func == 'function') {
      let idx = 0;

      for await (const item of iter) {
        yield await func.call(this, item, idx++, iter);
      }
    } else {
      for await (const item of iter) {
        yield item[func];
      }
    }
  },

  *mapMultiIter(iter, func) {
    if (func == null) {
      for (const item of iter) {
        yield item;
      }
    } else if (typeof func == 'function') {
      let idx = 0;

      for (const item of iter) {
        const res = func.call(this, item, idx++, iter);
        if (res == null) continue;
        if (this.iteratorObj(res)) yield* res; else yield res;
      }
    } else {
      for (const item of iter) {
        const res = item[func];
        if (res == null) continue;
        if (this.iteratorObj(res)) yield* res; else yield res;
      }
    }
  },

  async *mapMultiAsync(iter, func) {
    if (func == null) {
      for await (const item of iter) {
        yield item;
      }
    } else if (typeof func == 'function') {
      let idx = 0;

      for await (const item of iter) {
        const res = await func.call(this, item, idx++, iter);
        if (this.asyncIteratorObj(res)) yield* res; else yield res;
      }
    } else {
      for await (const item of iter) {
        const res = item[func];
        if (this.asyncIteratorObj(res)) yield* res; else yield res;
      }
    }
  },

  mapArray(iter, func) {
    const mapped = (
      func == null ? iter :
      this.mapIter(iter, func)
    );

    const arr = Array.from(mapped);
    return arr;
  },

  mapObject(obj, func, val) {
    const mapFunc = (
      func == null ?
      (val ? ([k, v]) => v : ([k, v]) => k) :
      typeof func === 'function' ?
      (val ? ([k, v]) => func.call(obj, v, k, obj) :
        ([k, v]) => func.call(obj, k, v, obj)) :
      typeof func === 'object' ?
      (val ? ([k, v]) => func[v] : ([k, v]) => func[k]) :
      (val ? ([k, v]) => func + v : ([k, v]) => func + k)
    );

    const result = this.mapIter(this.entries(obj), mapFunc);
    return result;
  },

  maps(array, func) {
    if (typeof func === 'function') {
      for (let i = 0; i < array.length; i++) {
        const value = func.call(array, array[i], i, array);
        array[i] = value;
      }
    } else if (typeof func === 'object') {
      for (let i = 0; i < array.length; i++) {
        const value = func[array[i]];
        array[i] = value;
      }
    } else {
      for (let i = 0; i < array.length; i++) {
        const value = func + array[i];
        array[i] = value;
      }
    }

    return array;
  },

  mapKeys(obj, func, inv) {
    const mapFunc = (
      func == null ?
      (inv ? ([k, v]) => ({[v]: func}) : ([k, v]) => ({[v]: v})) :

      typeof func === 'function' ?
      (inv ? ([k, v]) => ({[func.call(obj, k, v, obj)]: k}) :
        ([k, v]) => ({[func.call(obj, k, v, obj)]: v})) :

      typeof func === 'object' ?
      (inv ? ([k, v]) => ({[func[v]]: v}) : ([k, v]) => ({[func[k]]: v})) :

      (inv ? ([k, v]) => ({[v]: func}) : ([k, v]) => ({[!v ? v : v[func]]: v}))
    );

    const result = this.make(this.mapIter(this.entries(obj), mapFunc));
    return result;
  },

  mapValues(obj, func, inv) {
    const mapFunc = (
      func == null ?
      (inv ? ([k, v]) => ({[k]: k}) : ([k, v]) => ({[k]: func})) :

      typeof func === 'function' ?
      (inv ? ([k, v]) => ({[v]: func.call(obj, k, v, obj)}) :
        ([k, v]) => ({[k]: func.call(obj, k, v, obj)})) :

      typeof func === 'object' ?
      (inv ? ([k, v]) => ({[k]: func[v]}) : ([k, v]) => ({[k]: func[k]})) :

      (inv ? ([k, v]) => ({[k]: func + v}) : ([k, v]) => ({[k]: func}))
    );

    const result = this.make(this.mapIter(this.entries(obj), mapFunc));
    return result;
  },

  mapsKeys(obj, func, inv) {
    if (typeof func === 'function') {
      if (inv) {
        for (const [k, v] of this.entries(obj)) {
          const key = func.call(obj, v, k, obj);
          delete obj[k];
          obj[key] = k;
        }
      } else {
        for (const [k, v] of this.entries(obj)) {
          const key = func.call(obj, k, v, obj);
          delete obj[k];
          obj[key] = v;
        }
      }
    } else if (typeof func === 'object') {
      if (inv) {
        for (const [k, v] of this.entries(obj)) {
          const key = func[v];
          delete obj[k];
          obj[key] = v;
        }
      } else {
        for (const [k, v] of this.entries(obj)) {
          const key = func[k];
          delete obj[k];
          obj[key] = v;
        }
      }
    } else {
      if (inv) {
        for (const [k, v] of this.entries(obj)) {
          delete obj[k];
          obj[v] = func;
        }
      } else {
        for (const [k, v] of this.entries(obj)) {
          delete obj[k];
          obj[func + k] = v;
        }
      }
    }

    return obj;
  },

  //TODO: Map support for object-related

  mapsValues(obj, func, inv) {
    if (typeof func === 'function') {
      if (inv) {
        for (const [k, v] of this.entries(obj)) {
          const value = func.call(obj, k, v, obj);
          delete obj[k];
          obj[v] = value;
        }
      } else {
        for (const [k, v] of this.entries(obj)) {
          const value = func.call(obj, k, v, obj);
          obj[k] = value;
        }
      }
    } else if (typeof func === 'object') {
      if (inv) {
        for (const [k, v] of this.entries(obj)) {
          const value = func[v];
          obj[k] = value;
        }
      } else {
        for (const [k, v] of this.entries(obj)) {
          const value = func[k];
          obj[k] = value;
        }
      }
    } else {
      if (inv) {
        for (const [k, v] of this.entries(obj)) {
          obj[k] = func + v;
        }
      } else {
        for (const [k, v] of this.entries(obj)) {
          obj[k] = func;
        }
      }
    }

    return obj;
  },

  omit(from, ...what) {
    if (!from) return from;
    const keys = this.uniqKeys(what);

    const result = this.make(this.mapIter(this.entries(from), ([k, v]) => (
      k in keys ? null : ({[k]: v})
    )));

    return result;
  },

  omits(from, ...what) {
    if (!from) return from;
    const keys = this.uniqKeys(what);
    for (const key in keys) delete from[key];
    return from;
  },

  omitBy(from, func) {
    if (!from) return from;
    const keys = this.pickBy(from, func);
    const result = this.omit(from, keys);
    return result;
  },

  interface(Class) {
    const {name, length, prototype, ...statics} = Object.assign({},
      ...Object.getOwnPropertyNames(Class).map(name => ({[name]: Class[name]}))
    );

    const {constructor, ...methods} = Object.assign({},
      ...Object.getOwnPropertyNames(Class.prototype)
      .map(name => ({[name]: Class.prototype[name]}))
    );

    Object.assign(this, statics);
    Object.assign(this.prototype, methods);
  },

  pick(from, ...what) {
    if (!from) return from;
    const keys = this.uniqKeys(what);

    const result = this.make(this.mapIter(this.keys(keys), (key) => (
      key in from ? ({[key]: from[key]}) : null
    )));

    return result;
  },

  pickBy(from, func) {
    if (!from) return from;

    const result = this.make(
      this.mapIter(
        this.filterIter(
          this.entries(from),
          ([k, v]) => func.call(from, k, v, from)
        ),
        ([k, v]) => ({[k]: v})
      )
    );

    return result;
  },

  async prefetchAsyncBg(args, iter, size) {
    try {
      let value, done;

      while (args.wait = iter.next(args.buf.length), {value, done} = await args.wait, !done && !args.eof) {
        args.buf.push(value);

        if (size && args.buf.length >= size) {
          await new Promise((resolve) => { args.resume = resolve; });
          args.resume = null;
        }

        if (args.eof) break;
      }

      if (!done && iter.return) iter.return();
    } catch (err) {
      args.error = err;
    } finally {
      args.done = true;
    }
  },

  async *prefetchAsync(iter, size, {chunk, feedback} = {}) {
    const args = {buf: []};

    const lag = !feedback ? null : (item, idx, buf) => (
      {
        item,
        idx,
        curLen: buf.length,
        lagLen: args.buf.length,
        done: !!args.done
      }
    );

    let cur;

    try {
      this.$.prefetchAsyncBg(args, iter, size);

      while (!args.done) {
        const buf = args.buf;

        if (buf.length) {
          args.buf = [];
          if (chunk) yield buf; else yield* lag ? this.$.mapIter(buf, lag) : buf;
        } else if (args.wait) {
          await args.wait;
        }

        if (args.resume) args.resume();
      }

      if (args.error) {
        throw args.error;
      } else if (args.buf.length) {
        const buf = args.buf;
        args.buf = [];
        if (chunk) yield buf; else yield* lag ? this.$.mapIter(buf, lag) : buf;
      }
    } finally {
      args.eof = true;
    }
  },

  range(from, to, step) {
    if (to == null) {
      to = from;
      from = 0;
    }

    const diff = to - from;
    const count = Math.abs(step ? Math.ceil(diff / step) : diff);
    let inc = step || 1;
    if ((inc < 0) ^ (to < from)) inc = -inc;
    let value = from - inc;
    const result = this.maps(Array(count), () => (value += inc));
    return result;
  },

  *rangeIter(from, to, step = 1) {
    if (to == null) {
      to = from;
      from = 0;
    }

    for (let v = from; v < to; v += step) yield v;
  },

  *repeatIter(itrb, times) {
    for (let i = 0; i < times; i++) {
      const iter = this.iterable(itrb);
      yield* iter;
    }
  },

  async *repeatAsync(itrb, times) {
    for (let i = 0; i < times; i++) {
      const iter = this.asyncIterable(itrb);
      yield* iter;
    }
  },

  *stretch(value, times) {
    for (let i = 0; i < times; i++) yield value;
  },

  *stretchIter(iter, times) {
    if (this.iteratorObj(iter)) {
      for (const item of iter) for (let i = 0; i < times; i++) yield item;
    } else {
      for (let i = 0; i < times; i++) yield iter;
    }
  },

  async *stretchAsync(iter, times) {
    if (this.asyncIteratorObj(iter)) {
      for await (const item of iter) for (let i = 0; i < times; i++) yield item;
    } else {
      for (let i = 0; i < times; i++) yield iter;
    }
  },

  *filterIter(iter, func) {
    if (func == null) {
      for (const item of iter) {
        if (item) yield item;
      }
    } else if (typeof func == 'function') {
      let idx = 0;

      for (const item of iter) {
        if (func.call(this, item, idx++, iter)) yield item;
      }
    } else {
      for (const item of iter) {
        if (item[func]) yield item;
      }
    }
  },

  async *filterAsync(iter, func) {
    if (func == null) {
      for await (const item of iter) {
        if (item) yield item;
      }
    } else if (typeof func == 'function') {
      let idx = 0;

      for await (const item of iter) {
        if (await func.call(this, item, idx++, iter)) yield item;
      }
    } else {
      for await (const item of iter) {
        if (item[func]) yield item;
      }
    }
  },

  reduceIter(iter, func, init) {
    for (const item of iter) {
      if (init === undefined) init = item;
      else init = func.call(this, init, item, iter);
    }

    return init;
  },

  async reduceAsync(iter, func, init) {
    for await (const item of iter) {
      if (init === undefined) init = item;
      else init = await func.call(this, init, item, iter);
    }

    return init;
  },

  *partialDimIter(pfx, dim1, dim2, ...dims) {
    for (const item of dim1) {
      const out = [...pfx, item];
      if (dim2) yield* this.partialDimIter(out, this.iterable(dim2, out), ...dims);
      else yield out;
    }
  },

  async *partialDimAsync(pfx, dim1, dim2, ...dims) {
    for await (const item of dim1) {
      const out = [...pfx, item];
      if (dim2) yield* this.partialDimAsync(out, this.asyncIterable(dim2, out), ...dims);
      else yield out;
    }
  },

  *dimIter(...dims) {
    const pfx = [];
    yield* this.partialDimIter(pfx, ...dims);
  },

  async *dimAsync(...dims) {
    const pfx = [];
    yield* this.partialDimAsync(pfx, ...dims);
  },

  //WARN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/setPrototypeOf

  pure(obj, ...parts) {
    if (obj != null) Object.setPrototypeOf(obj, null);
    else obj = Object.create(null);
    if (parts.length) this.extend(obj, ...parts);
    return obj;
  },

  async pureAsync(obj, ...parts) {
    if (obj != null) Object.setPrototypeOf(obj, null);
    else obj = Object.create(null);
    if (parts.length) await this.extendAsync(obj, ...parts);
    return obj;
  },

  proto(up, obj, ...parts) {
    if (obj != null) Object.setPrototypeOf(obj, up);
    else obj = Object.create(up);
    if (parts.length) this.extend(obj, ...parts);
    return obj;
  },

  async protoAsync(up, obj, ...parts) {
    if (obj != null) Object.setPrototypeOf(obj, up);
    else obj = Object.create(up);
    if (parts.length) await this.extendAsync(obj, ...parts);
    return obj;
  },

  remove(arr, func) {
    const res = [];
    let i = 0;

    if (typeof func === 'function') {
      while (i < arr.length) {
        if (func.call(this, arr[i], i, arr)) res.push(...arr.splice(i, 1));
        else i++;
      }
    } else {
      while (i < arr.length) {
        if (func == arr[i]) res.push(...arr.splice(i, 1));
        else i++;
      }
    }

    return res;
  },

  regExpInput(s) {
    const result = s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    return result;
  },

  rxDotSplit: /^([^\.]*)(?:\.(.*))?$/,
  rxIds: /\w+/g,
  rxNestIds: /[\w\.]+/g,

  setTree(obj, to, opts) {
    if (typeof obj !== 'object') return obj;
    const o = opts || {};
    const r = to || this.make();

    for (const [k, v] of this.entries(obj)) {
      const [, key, rest] = k.match(this.rxDotSplit) || [];
      const isObj = rest || (o.deep && typeof v === 'object');

      if (isObj) {
        this.setTree(
          rest ? {[rest]: v} : v,
          typeof r[key] === 'object' ? r[key] : (r[key] = this.make()),
          opts
        );
      } else {
        if (o.unset) {
          delete r[key];
        } else {
          r[key] = v;
        }
      }
    }

    return r;
  },

  merge(to, ...objs) {
    return objs.reduce((a, b) => this.setTree(b, a), to);
  },

  mergeDeep(to, ...objs) {
    return objs.reduce((a, b) => this.setTree(b, a, {deep: true}), to);
  },

  unmerge(to, ...objs) {
    return objs.reduce((a, b) => this.setTree(b, a, {unset: true}), to);
  },

  unmergeDeep(to, ...objs) {
    return objs.reduce((a, b) => this.setTree(b, a, {unset: true, deep: true}), to);
  },

  scanObject(to, obj, {rxName, rxType, rxCtorName} = {}) {
    if (!to) to = this.make();

    for (const k of Object.getOwnPropertyNames(obj)) {
      if (k in to) continue;
      if (rxName && !rxName.test(k)) continue;
      const v = obj[k];
      if (rxType && !rxType.test(typeof v)) continue;
      if (rxCtorName && v && v.constructor && !rxCtorName.test(v.constructor.name)) continue;
      to[k] = v;
    }

    return to;
  },

  scanObjectAll(obj, rx) {
    const to = this.make();

    while (obj) {
      this.scanObject(to, obj, rx);
      obj = Object.getPrototypeOf(obj);
    }

    return to;
  },

  zipArray(...collate) {
    const result = [];
    const count = collate.map(array => array.length).reduce(this.max);

    for (let i = 0; i < count; i++) {
      this.append(result, collate);
    }

    return result;
  },

  *zipTermIter(...collate) {
    const length = collate.length;
    let left = length;

    const iters = collate.map((iter) => (
      this.iteratorObj(iter, true) ||
      this.iteratorObj([iter], true)
    ));

    try {
      while (left) {
        for (let i = 0; i < iters.length; i++) {
          const iter = iters[i];

          if (iter) {
            const next = iter.next();

            if (next.done) {
              delete iters[i];
              left--;
              yield;
            } else {
              yield next.value;
            }
          } else yield;
        }
      }
    } catch (err) {
      for (let i = 0; i < iters.length; i++) {
        const iter = iter[i];

        if (iter && iter.throw) {
          iter.throw(err);
          delete iters[i];
        }
      }

      throw err;
    } finally {
      for (const iter of iters) if (iter && iter.return) {
        iter.return();
      }
    }
  },

  async *zipTermAsync(...collate) {
    const length = collate.length;
    let left = length;

    const iters = collate.map((iter) => (
      this.asyncIteratorObj(iter, true) ||
      this.iteratorObj([iter], true)
    ));

    try {
      while (left) {
        for (let i = 0; i < iters.length; i++) {
          const iter = iters[i];

          if (iter) {
            const next = await iter.next();

            if (next.done) {
              delete iters[i];
              left--;
              yield;
            } else {
              yield next.value;
            }
          } else yield;
        }
      }
    } catch (err) {
      await this.all(iters.map((iter, i) => (
        iter && (
          iters[i] = null,
          iter.throw &&
          iter.throw(err)
        )
      )));

      throw err;
    } finally {
      await this.all(iters.map((iter) => (
        iter && (
          iter.return &&
          iter.return(err)
        )
      )));
    }
  },

  zipIter(...collate) {
    const term = this.zipTermIter(...collate);
    const trim = this.cutLastIter(term, collate.length);
    return trim;
  },

  zipAsync(...collate) {
    const term = this.zipTermAsync(...collate);
    const trim = this.cutLastAsync(term, collate.length);
    return trim;
  },

  feedAsync() {
    const context = this;
    const buf = [];
    let done = false;
    let wait, trigger = this.null, fail = this.null;

    const result = {
      context,

      async next() {
        while (true) {
          if (buf.length) return {value: buf.shift(), done: false};
          if (done) return {done: true};
          if (!wait) wait = new Promise((ok, nok) => { trigger = ok; fail = nok; });
          await wait;
          wait = null;
        }
      },

      throw(err) {
        fail(err);
      },

      return(value) {
        done = true;
        trigger();
        return {value, done};
      },

      end() {
        done = true;
        trigger();
      },

      push(...items) {
        if (done) return;
        if (items.length) buf.push(...items);
        else done = true;
        trigger();
        return this;
      },

      pushIter(...items) {
        if (done) return;

        if (items.length) {
          for (const item of items) this.context.append(buf, item);
        } else done = true;

        trigger();
        return this;
      },

      async pushAsync(...items) {
        if (done) return;

        if (items.length) {
          for (const item of items) {
            if (this.context.asyncIteratorObj(item)) {
              for await (const sub of item) {
                this.push(sub);
              }
            } else {
              this.push(item);
            }
          }
        } else done = true;

        trigger();
        return this;
      },

      [Symbol.asyncIterator]() { return this; }
    };

    return result;
  },

  feedback(iterb) {
    const iterFn = iterb[Symbol.iterator];
    const asIterFn = iterb[Symbol.asyncIterator];
    if (!iterFn && !asIterFn) throw new Error('not iterator');
    let fv;

    const iter = asIterFn ? asIterFn.call(iterb) : iterFn.call(iterb);
    const iobj = (v) => { fv = v; };
    const selfIterFn = () => iobj;

    iobj.next = (old) => {
      const next = iter.next(fv !== undefined ? fv : old);
      fv = undefined;
      return next;
    };

    if (iter.throw) iobj.throw = (err) => iter.throw(err);
    if (iter.return) iobj.return = (ret) => iter.return(ret);
    if (iterFn) iobj[Symbol.iterator] = selfIterFn;
    if (asIterFn) iobj[Symbol.asyncIterator] = selfIterFn;

    return iobj;
  },

  async *pageAsync(fbIter, cursor, skip, limit, out = {}) {
    out.skip = skip;
    out.limit = limit;
    out.last = null;
    out.end = false;

    const fb = this.$.feedback(fbIter);

    for await (const res of fb) {
      if (out.limit <= 0) break;
      out.length = 0;

      for (const item of res) {
        const score = item[cursor];

        if (out.last == null || score !== out.last) {
          out.last = score;
          out.skip = 1;
        } else {
          out.skip++;
        }

        out.length++;
        yield item;
      }

      out.limit -= out.length;
      fb(out);
    }

    out.end = true;
  },

  nsecMcSec: 10n ** 3n,
  nsecMsec: 10n ** 6n,
  nsecSec: 10n ** 9n,
  nsecMin: (10n ** 9n) * 60n,

  async *nsecAsync(iter, div) {
    let index = 0;
    let stamp = process.hrtime.bigint();

    for await (const item of iter) {
      const after = process.hrtime.bigint();

      if (div) yield {item, index, time: (after - stamp) / BigInt(div)};
      else yield {item, index, time: (after - stamp)};

      stamp = after;
      index++;
    }
  },

  execIter(iter, func, endFunc) {
    let idx = 0;

    if (func) {
      for (const item of iter) func.call(this, item, idx++, iter);
      if (endFunc) endFunc.call(this, idx, iter);
    } else {
      for (const item of iter) idx++;
      if (endFunc) endFunc.call(this, idx, iter);
    }
  },

  async execAsync(iter, func, endFunc) {
    let idx = 0;

    if (func) {
      for await (const item of iter) await func.call(this, item, idx++, iter);
      if (endFunc) await endFunc.call(this, idx, iter);
    } else {
      for await (const item of iter) idx++;
      if (endFunc) await endFunc.call(this, idx, iter);
    }
  },

  collateIter(zipped, count) {
    const chunked = this.chunkIter(zipped, count);
    const forked = this.forkIter(chunked, count);
    const mapped = forked.map((fork, i) => this.mapIter(fork, i));
    return mapped;
  },

  collateAsync(zipped, count) {
    const chunked = this.chunkAsync(zipped, count);
    const forked = this.forkAsync(chunked, count);
    const mapped = forked.map((fork, i) => this.mapAsync(fork, i));
    return mapped;
  },

  zipObject(keys, values) {
    const result = this.make(this.mapIter(this.entries(keys), ([i, key]) => ({[key]: values[i]})));
    return result;
  }
};
