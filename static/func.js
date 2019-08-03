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

  max(a, b) {
    return Math.max(a,b);
  },

  min(a, b) {
    return Math.min(a,b);
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

  set(object, ...walk) {
    let p = object;
    if (p == null) return p;
    const value = walk.pop();
    const last = walk.pop();

    for (const step of walk) {
      if (p[step] == null) p[step] = typeof step === 'number' ? [] : ClasyncFunc.makeObject();
      p = p[step];
    }

    p[last] = value;
    return p;
  },

  makeObject(...parts) {
    const result = Object.assign(Object.create(null), ...ClasyncFunc.flatten(parts));
    return result;
  },

  objectOrUndefined: {object: 1, undefined: 1},

  uniqKeys(what, def) {
    const keys = ClasyncFunc.makeObject(what.map(i => (
      i instanceof Array ? ClasyncFunc.makeObject(i.map(j => ({[j]: def}))) :
      typeof i in ClasyncFunc.objectOrUndefined ? i : ({[i]: def})
    )));

    return keys;
  },

  chunk(array, length) {
    const chunks = ClasyncFunc.range(0, array.length, length);
    ClasyncFunc.maps(chunks, from => array.slice(from, from + length));
    return chunks;
  },

  clone(obj) {
    if (obj instanceof Array) return obj.slice();
    if (typeof obj === 'object') return {...obj};
    return obj;
  },

  cloneDeep(obj) {
    if (obj instanceof Array) return obj.map(ClasyncFunc.cloneDeep);

    if (typeof obj === 'object') return ClasyncFunc.makeObject(
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
    const result = ClasyncFunc.makeObject(pairs.map(([k, v]) => ({[k]: v})));
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

  firstKey(obj) {
    for (const key in obj) return key;
  },

  firstValue(obj) {
    for (const key in obj) return obj[key];
  },

  firstEntry(obj) {
    for (const key in obj) return [key, obj[key]];
    return [];
  },

  invert(obj) {
    const result = ClasyncFunc.makeObject(Object.entries(obj).map(([k, v]) => ({[v]: k})));
    return result;
  },

  inverts(obj, map) {
    const ents = Object.entries(obj);
    const groups = ClasyncFunc.makeObject(ents.map(([k, v]) => ({[v]: true})));
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

  maps(array, func) {
    for (let i = 0; i < array.length; i++) {
      const value = func.call(array, array[i], i, array);
      array[i] = value;
    }

    return array;
  },

  mapKeys(obj, func) {
    const result = ClasyncFunc.makeObject(Object.entries(obj).map(([k, v]) => {
      const key = func.call(obj, k, v, obj);
      const result = ({[key]: v});
      return result;
    }));

    return result;
  },

  mapValues(obj, func) {
    const result = ClasyncFunc.makeObject(Object.entries(obj).map(([k, v]) => {
      const value = func.call(obj, k, v, obj);
      const result = ({[k]: value});
      return result;
    }));

    return result;
  },

  mapsKeys(obj, func) {
    for (const [k, v] of Object.entries(obj)) {
      const key = func.call(obj, k, v, obj);
      delete obj[k];
      obj[key] = v;
    }

    return obj;
  },

  mapsValues(obj, func) {
    for (const [k, v] of Object.entries(obj)) {
      const value = func.call(obj, k, v, obj);
      obj[k] = value;
    }

    return obj;
  },

  omit(from, ...what) {
    const keys = ClasyncFunc.uniqKeys(what);

    const result = ClasyncFunc.makeObject(Object.entries(from).map(([k, v]) => (
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

  pick(from, ...what) {
    const keys = ClasyncFunc.uniqKeys(what);

    const result = ClasyncFunc.makeObject(Object.keys(keys).map(key => (
      key in from ? ({[key]: from[key]}) : null
    )));

    return result;
  },

  pickBy(from, func) {
    const result = ClasyncFunc.makeObject(
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

    while (i < arr.length) {
      if (func.call(this, arr[i], i, arr)) res.push(...arr.splice(i, 1));
      else i++;
    }

    return res;
  },

  regExpInput(s) {
    const result = s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    return result;
  },

  rxDotSplit: /^([^\.]*)(?:\.(.*))?$/,

  setTree(obj, to, opts) {
    if (typeof obj !== 'object') return obj;
    const o = opts || {};
    const r = to || ClasyncFunc.makeObject();

    for (const [k, v] of Object.entries(obj)) {
      const [, key, rest] = k.match(ClasyncFunc.rxDotSplit) || [];
      const isObj = rest || (o.deep && typeof v === 'object');

      if (isObj) {
        ClasyncFunc.setTree(
          rest ? {[rest]: v} : v,
          typeof r[key] === 'object' ? r[key] : (r[key] = ClasyncFunc.makeObject()),
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

  zipArray(...collate) {
    const result = [];
    const count = collate.map(array => array.length).reduce((a, b) => a > b ? a : b);
    for (let i = 0; i < count; i++) result.push.call(result, ...collate.map(array => array[i]));
    return result;
  },

  zipObject(keys, values) {
    const result = ClasyncFunc.makeObject(keys.map((key, i) => ({[key]: values[i]})));
    return result;
  }
};

module.exports = ClasyncFunc;
