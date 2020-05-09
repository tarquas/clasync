let ClasyncFunc;

ClasyncFunc = {
  private(fields) {
    const res = Object.create(null);

    for (const [field, value] of Object.entries(fields)) {
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

  keyValueString(k, v) {
    return `${k}: ${v}`;
  },

  string(a) {
    if (a == null) return String(a);
    if (a instanceof Date) return a.toISOString();

    if (a instanceof Set) a = Array.from(a);
    else if (a instanceof Map) a = Array.from(a.map(ClasyncFunc.keyValueString));

    if (a instanceof Array) return a.join(', ');
    if (typeof a === 'object') return Object.entries(a).map(ClasyncFunc.keyValueString).join(', ');
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
      if (v instanceof Map) return ClasyncFunc.fromPairs(Array.from(v));

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

  funcSort(func, ...rest) {
    return (a, b) => {
      const A = func(a, ...rest);
      const B = func(b, ...rest);
      const res = A > B ? 1 : A < B ? -1 : 0;
      return res;
    }
  },

  objSort(...walk) {
    return (a, b) => {
      const A = ClasyncFunc.get(a, ...walk);
      const B = ClasyncFunc.get(b, ...walk);
      const res = A > B ? 1 : A < B ? -1 : 0;
      return res;
    };
  },

  objFuncSort(...walk) {
    return (a, b) => {
      const A = ClasyncFunc.get(func(a), ...walk);
      const B = ClasyncFunc.get(func(b), ...walk);
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
      if (n == null) p[step] = p = typeof walk[i+1] === 'number' ? [] : ClasyncFunc.make();
      else p = n;
    }

    return p;
  },

  set(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = ClasyncFunc.ensure(object, ...walk);
    const last = walk.pop();
    p[last] = value;
    return p;
  },

  setDef(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = ClasyncFunc.ensure(object, ...walk);
    const last = walk.pop();
    if (!(last in p)) { p[last] = value; return value; }
    return p[last];
  },

  setAdd(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = ClasyncFunc.ensure(object, ...walk);
    const last = walk.pop();

    if (last in p) {
      if (value instanceof Array) p[last].push(...value);
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
      else if (typeof value === 'object') p[last] = ClasyncFunc.make(value);
      else if (typeof value === 'function') value(p[last], p, last);
      else if (typeof value === 'undefined') {}
      else p[last] = value;
    }

    return p[last];
  },

  setPush(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = ClasyncFunc.ensure(object, ...walk);
    const last = walk.pop();
    let arr = p[last];
    if (!(arr instanceof Array)) p[last] = arr = [value];
    else arr.push(value);
    return arr;
  },

  setUnshift(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = ClasyncFunc.ensure(object, ...walk);
    const last = walk.pop();
    let arr = p[last];
    if (!(arr instanceof Array)) p[last] = arr = [value];
    else arr.unshift(value);
    return arr;
  },

  setExtend(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = ClasyncFunc.ensure(object, ...walk);
    const last = walk.pop();
    let obj = p[last];
    if (!(typeof obj === 'object')) p[last] = obj = this.$.make(value);
    else Object.assign(obj, value);
    return obj;
  },

  setDefaults(object, ...walk) {
    if (object == null) return object;
    const value = walk.pop();
    const p = ClasyncFunc.ensure(object, ...walk);
    const last = walk.pop();
    let obj = p[last];
    if (!(typeof obj === 'object')) p[last] = obj = this.$.make(value);
    else ClasyncFunc.defaults(obj, value);
    return obj;
  },

  make(...parts) {
    const result = Object.assign(Object.create(null), ...ClasyncFunc.flatten(parts));
    return result;
  },

  makeObject(...parts) {
    const result = Object.assign(Object.create(null), ...ClasyncFunc.flatten(parts));
    return result;
  },

  objectOrUndefined: {object: 1, undefined: 1},

  uniqKeys(what, def) {
    const keys = ClasyncFunc.make(what.map(i => (
      i instanceof Array ? ClasyncFunc.make(i.map(j => ({[j]: def}))) :
      typeof i in ClasyncFunc.objectOrUndefined ? i : ({[i]: def})
    )));

    return keys;
  },

  accumulate(acc, obj) {
    if (obj == null) return acc;

    if (obj instanceof Array) {
      if (acc.length == null) acc.length = 0;
      Array.prototype.push.call(acc, ...obj);
    } else if (obj instanceof Set) {
      if (acc.add) obj.forEach(item => acc.add(item));
      else Array.prototype.push.call(acc, ...obj.values());
    } else if (obj instanceof Map) {
      if (acc.set) obj.forEach((v, k) => acc.set(k, v));
      else Object.assign(acc, ClasyncFunc.fromPairs(Array.from(obj.entries())));
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
    const chunks = ClasyncFunc.range(0, array.length, length);
    ClasyncFunc.maps(chunks, from => array.slice(from, from + length));
    return chunks;
  },

  clone(obj) {
    if (!obj) return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.slice();
    if (obj instanceof Map) return new Map(obj);
    if (obj instanceof Set) return new Set(obj);
    if (typeof obj === 'object') return ClasyncFunc.make(obj);
    return obj;
  },

  cloneDeep(obj) {
    if (!obj) return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(ClasyncFunc.cloneDeep);
    if (obj instanceof Map) return new Map(obj);
    if (obj instanceof Set) return new Set(obj);

    if (typeof obj === 'object') return ClasyncFunc.make(
      Object.entries(obj)
      .map(([k, v]) => ({[k]: ClasyncFunc.cloneDeep(v)}))
    );

    return obj;
  },

  defaults(obj, ...defs) {
    for (const def of defs) {
      Object.assign(obj, ...Object.entries(def).map(([k, v]) => k in obj ? null: ({[k]: v})));
    }

    return obj;
  },

  extend(obj, ...ext) {
    const result = Object.assign(obj, ...ext);
    return result;
  },

  flatten(array) {
    if (!(array instanceof Array)) return array;
    return [].concat(...array);
  },

  flattenDeep(array) {
    if (!(array instanceof Array)) return array;
    return [].concat(...array.map(deep => ClasyncFunc.flattenDeep(deep)));
  },

  fromPairs(pairs) {
    const result = ClasyncFunc.make(pairs.map(([k, v]) => ({[k]: v})));
    return result;
  },

  groupBy(array, func) {
    const groups = array.map(typeof func === 'function' ? func : item => item[func]);
    const result = ClasyncFunc.inverts(groups, array);
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

  anyInstanceOf(obj, ...types) {
    for (const type of types) {
      if (obj instanceof type) return true;
    }

    return false;
  },

  iterableTypes: [Array, Map, Set],

  firstKey(obj) {
    if (!obj) return;
    if (ClasyncFunc.anyInstanceOf(obj, ClasyncFunc.iterableTypes)) return obj.keys().next();
    if (obj[Symbol.iterator]) return obj[Symbol.iterator]().next().value;
    for (const key in obj) return key;
  },

  firstValue(obj) {
    if (!obj) return;
    if (ClasyncFunc.anyInstanceOf(obj, ClasyncFunc.iterableTypes)) return obj.values().next();
    if (obj[Symbol.iterator]) return obj[Symbol.iterator]().next().value;
    for (const key in obj) return obj[key];
  },

  firstEntry(obj) {
    if (!obj) return;
    if (ClasyncFunc.anyInstanceOf(obj, ClasyncFunc.iterableTypes)) return obj.entries().next();
    if (obj[Symbol.iterator]) return obj[Symbol.iterator]().next().value;
    for (const key in obj) return [key, obj[key]];
    return [];
  },

  invert(obj) {
    const result = ClasyncFunc.make(Object.entries(obj).map(([k, v]) => ({[v]: k})));
    return result;
  },

  inverts(obj, map) {
    const ents = Object.entries(obj);

    const groups = ClasyncFunc.make(ents.map(
      ([k, v]) => v instanceof Array ? ClasyncFunc.invert(v) : ({[v]: true})
    ));

    ClasyncFunc.mapsValues(groups, () => []);

    for (const [k, v] of ents) {
      const h = map ? map[k] : k;

      if (v instanceof Array) {
        for (const g of v) {
          groups[g].push(h);
        }
      } else {
        groups[v].push(h);
      }
    }

    return groups;
  },

  map(obj, func, val) {
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

    const result = Object.entries(obj).map(mapFunc);
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

    const result = ClasyncFunc.make(Object.entries(obj).map(mapFunc));
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

    const result = ClasyncFunc.make(Object.entries(obj).map(mapFunc));
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
    const keys = ClasyncFunc.uniqKeys(what);

    const result = ClasyncFunc.make(Object.entries(from).map(([k, v]) => (
      k in keys ? null : ({[k]: v})
    )));

    return result;
  },

  omits(from, ...what) {
    const keys = ClasyncFunc.uniqKeys(what);
    for (const key in keys) delete from[key];
    return from;
  },

  omitBy(from, func) {
    const keys = ClasyncFunc.pickBy(from, func);
    const result = ClasyncFunc.omit(from, keys);
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
    const keys = ClasyncFunc.uniqKeys(what);

    const result = ClasyncFunc.make(Object.keys(keys).map(key => (
      key in from ? ({[key]: from[key]}) : null
    )));

    return result;
  },

  pickBy(from, func) {
    const result = ClasyncFunc.make(
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
    const result = ClasyncFunc.maps(Array(count), () => (value += inc));
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
    const r = to || ClasyncFunc.make();

    for (const [k, v] of Object.entries(obj)) {
      const [, key, rest] = k.match(ClasyncFunc.rxDotSplit) || [];
      const isObj = rest || (o.deep && typeof v === 'object');

      if (isObj) {
        ClasyncFunc.setTree(
          rest ? {[rest]: v} : v,
          typeof r[key] === 'object' ? r[key] : (r[key] = ClasyncFunc.make()),
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
    return objs.reduce((a, b) => ClasyncFunc.setTree(b, a), to);
  },

  mergeDeep(to, ...objs) {
    return objs.reduce((a, b) => ClasyncFunc.setTree(b, a, {deep: true}), to);
  },

  unmerge(to, ...objs) {
    return objs.reduce((a, b) => ClasyncFunc.setTree(b, a, {unset: true}), to);
  },

  unmergeDeep(to, ...objs) {
    return objs.reduce((a, b) => ClasyncFunc.setTree(b, a, {unset: true, deep: true}), to);
  },

  zipArray(...collate) {
    const result = [];
    const count = collate.map(array => array.length).reduce(ClasyncFunc.max);
    for (let i = 0; i < count; i++) result.push.call(result, ...collate.map(array => array[i]));
    return result;
  },

  zipObject(keys, values) {
    const result = ClasyncFunc.make(keys.map((key, i) => ({[key]: values[i]})));
    return result;
  }
};

module.exports = ClasyncFunc;
