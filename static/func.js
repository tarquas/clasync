const ClasyncFunc = {
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

  null() {
    return null;
  },

  bound() {
    return this;
  },

  async aecho(arg) {
    return arg;
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
      if (tail[Symbol.iterator]) {
        for (const sub of this.chunk(tail, 1000)) {
          Array.prototype.push.apply(array, sub);
        }
      } else {
        Array.prototype.push.call(array, tail);
      }
    }

    return array;
  },

  //

  keyValueString([k, v]) {
    return `${k}: ${v}`;
  },

  string$(a) {
    if (a == null) return String(a);
    if (a instanceof Date) return a.toISOString();

    if (a instanceof Set) a = Array.from(a);
    else if (a instanceof Map) a = Array.from(a).map(this.keyValueString);

    if (a instanceof Array) return a.join(', ');
    if (typeof a === 'object') return this.mapArray(this.entries(a), this.keyValueString).join(', ');
    return a.toString();
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
      if (v instanceof Map) return this.fromPairs(Array.from(v));

      if (v instanceof WeakMap) {
        if (opts.special) return opts.special.call(this, k, v);
        return `[${this.$.getDef(v, 'constructor', 'name', '<null>')}]`;
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

  get(object, ...walk) {
    let p = object;

    for (const step of walk) {
      if (p == null) return p;
      p = p[step];
    }

    return p;
  },

  getDef(object, ...walk) {
    let p = object;
    const value = walk.pop();

    for (const step of walk) {
      if (p == null || !(step in p)) return value;
      p = p[step];
    }

    return p;
  },

  ensure(object, ...walk) {
    let p = object;
    if (p == null) return p;
    let n = null, pr = null;
    const l = walk.length - 1;

    for (let i = 0; i < l; i++) {
      const step = walk[i];
      const n = p[step];
      if (n == null) p[step] = p = typeof walk[i+1] === 'number' ? [] : this.make();
      else p = n;
    }

    return p;
  },

  set(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = this.ensure(object, ...walk);
    const last = walk.pop();
    p[last] = value;
    return p;
  },

  setDef(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = this.ensure(object, ...walk);
    const last = walk.pop();
    if (!(last in p)) { p[last] = value; return value; }
    return p[last];
  },

  setAdd(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = this.ensure(object, ...walk);
    const last = walk.pop();

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
    const p = this.ensure(object, ...walk);
    const last = walk.pop();
    let arr = p[last];
    if (!(arr instanceof Array)) p[last] = arr = [value];
    else arr.push(value);
    return arr;
  },

  setUnshift(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = this.ensure(object, ...walk);
    const last = walk.pop();
    let arr = p[last];
    if (!(arr instanceof Array)) p[last] = arr = [value];
    else arr.unshift(value);
    return arr;
  },

  setExtend(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = this.ensure(object, ...walk);
    const last = walk.pop();
    let obj = p[last];
    if (!(typeof obj === 'object')) p[last] = obj = this.$.make(value);
    else Object.assign(obj, value);
    return obj;
  },

  setDefaults(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = this.ensure(object, ...walk);
    const last = walk.pop();
    let obj = p[last];
    if (!(typeof obj === 'object')) p[last] = obj = this.$.make(value);
    else this.defaults(obj, value);
    return obj;
  },

  make(...parts) {
    const result = Object.create(null);

    for (const part of parts) {
      if (part[Symbol.iterator]) {
        for (const sub of part) Object.assign(result, sub);
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
    const keys = this.make(what.map(i => (
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
      else Object.assign(acc, this.fromPairs(Array.from(obj.entries())));
    } else if (typeof obj === 'object') {
      Object.assign(acc, obj);
    } else if (typeof obj === 'function') {
      Object.assign(acc, obj.call(this, acc));
    } else {
      Object.assign(acc, {[obj]: true});
    }

    return acc;
  },

  *chunk(iter, length) {
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
    if (obj instanceof Array) return obj.map(this.cloneDeep);
    if (obj instanceof Map) return new Map(obj);
    if (obj instanceof Set) return new Set(obj);

    if (typeof obj === 'object') return this.make(
      this.map(obj, (k, v) => ({[k]: this.cloneDeep(v)}))
    );

    return obj;
  },

  defaults(obj, ...defs) {
    for (const def of defs) {
      if (def[Symbol.iterator]) {
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

  extend(obj, ...exts) {
    for (const ext of exts) {
      if (ext[Symbol.iterator]) {
        for (const sub of ext) Object.assign(obj, sub);
      } else {
        Object.assign(obj, ext);
      }
    }

    return obj;
  },

  flatten(array) {
    if (!(array[Symbol.iterator])) return array;
    if (array.flat) return array.flat();
    const result = [];
    for (const sub of array) this.append(result, sub);
    return result;
  },

  flattenDeep(array) {
    if (!(array[Symbol.iterator])) return array;
    if (array.flat) return array.flat();
    const result = [];
    for (const sub of array) this.append(result, sub.map(this.flattenDeep));
    return result;
  },

  fromPairs(pairs) {
    if (Object.fromEntries) return Object.fromEntries(pairs);
    const result = this.make(this.mapArray(pairs, ([k, v]) => ({[k]: v})));
    return result;
  },

  groupBy(array, func) {
    const groups = array.map(typeof func === 'function' ? func : item => item[func]);
    const result = this.inverts(groups, array);
    return result;
  },

  hasKeys(obj) {
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
    if (this.anyInstanceOf(obj, this.iterableTypes)) return obj.keys().next().value;
    if (obj[Symbol.iterator]) return obj[Symbol.iterator]().next().value;
    for (const key in obj) return key;
  },

  firstValue(obj) {
    if (!obj) return;
    if (this.anyInstanceOf(obj, this.iterableTypes)) return obj.values().next().value;
    if (obj[Symbol.iterator]) return obj[Symbol.iterator]().next().value;
    for (const key in obj) return obj[key];
  },

  firstEntry(obj) {
    if (!obj) return;
    if (this.anyInstanceOf(obj, this.iterableTypes)) return obj.entries().next().value;
    if (obj[Symbol.iterator]) return obj[Symbol.iterator]().next().value;
    for (const key in obj) return [key, obj[key]];
    return [];
  },

  invert(obj) {
    const result = this.make(this.mapObject(obj, (k, v) => ({[v]: k})));
    return result;
  },

  inverts(obj, map) {
    const ents = Object.entries(obj);

    const groups = this.make(ents.map(
      ([k, v]) => v instanceof Array ? this.invert(v) : ({[v]: true})
    ));

    this.mapsValues(groups, () => []);

    for (const [k, v] of ents) {
      const h = map ? map[k] : k;

      if (v[Symbol.iterator]) {
        for (const g of v) {
          groups[g].push(h);
        }
      } else {
        groups[v].push(h);
      }
    }

    return groups;
  },

  *mapIter(iter, func) {
    if (func == null) {
      for (const item of iter) {
        yield item;
      }
    } else if (typeof func == 'function') {
      for (const item of iter) {
        yield func.call(this, item);
      }
    } else {
      for (const item of iter) {
        yield func[item];
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
      (inv ? ([k, v]) => ({[v]: func}) : ([k, v]) => ({[func + k]: v}))
    );

    const result = this.make(Object.entries(obj).map(mapFunc));
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

    const result = this.make(Object.entries(obj).map(mapFunc));
    return result;
  },

  mapsKeys(obj, func, inv) {
    if (typeof func === 'function') {
      if (inv) {
        for (const [k, v] of Object.entries(obj)) {
          const key = func.call(obj, v, k, obj);
          delete obj[k];
          obj[key] = k;
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const key = func.call(obj, k, v, obj);
          delete obj[k];
          obj[key] = v;
        }
      }
    } else if (typeof func === 'object') {
      if (inv) {
        for (const [k, v] of Object.entries(obj)) {
          const key = func[v];
          delete obj[k];
          obj[key] = v;
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const key = func[k];
          delete obj[k];
          obj[key] = v;
        }
      }
    } else {
      if (inv) {
        for (const [k, v] of Object.entries(obj)) {
          delete obj[k];
          obj[v] = func;
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          delete obj[k];
          obj[func + k] = v;
        }
      }
    }

    return obj;
  },

  mapsValues(obj, func, inv) {
    if (typeof func === 'function') {
      if (inv) {
        for (const [k, v] of Object.entries(obj)) {
          const value = func.call(obj, k, v, obj);
          delete obj[k];
          obj[v] = value;
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const value = func.call(obj, k, v, obj);
          obj[k] = value;
        }
      }
    } else if (typeof func === 'object') {
      if (inv) {
        for (const [k, v] of Object.entries(obj)) {
          const value = func[v];
          obj[k] = value;
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const value = func[k];
          obj[k] = value;
        }
      }
    } else {
      if (inv) {
        for (const [k, v] of Object.entries(obj)) {
          obj[k] = func + v;
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          obj[k] = func;
        }
      }
    }

    return obj;
  },

  omit(from, ...what) {
    const keys = this.uniqKeys(what);

    const result = this.make(Object.entries(from).map(([k, v]) => (
      k in keys ? null : ({[k]: v})
    )));

    return result;
  },

  omits(from, ...what) {
    const keys = this.uniqKeys(what);
    for (const key in keys) delete from[key];
    return from;
  },

  omitBy(from, func) {
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
    const keys = this.uniqKeys(what);

    const result = this.make(Object.keys(keys).map(key => (
      key in from ? ({[key]: from[key]}) : null
    )));

    return result;
  },

  pickBy(from, func) {
    const result = this.make(
      Object.entries(from)
      .filter(([k, v]) => func.call(from, k, v, from))
      .map(([k, v]) => ({[k]: v}))
    );

    return result;
  },

  range(sfrom, sto, step) {
    let from = sfrom;
    let to = sto;

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

    for (const [k, v] of Object.entries(obj)) {
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

  zipArray(...collate) {
    const result = [];
    const count = collate.map(array => array.length).reduce(this.max);

    for (let i = 0; i < count; i++) {
      this.append(result, collate);
    }

    return result;
  },

  zipObject(keys, values) {
    const result = this.make(keys.map((key, i) => ({[key]: values[i]})));
    return result;
  }
};

module.exports = ClasyncFunc;
