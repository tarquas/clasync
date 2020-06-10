const util = require('util');

const ClasyncPromise = {
  promisify(obj, method, ...rest) {
    if (method == null) return util.promisify(obj);
    const func = typeof method === 'function' ? method : obj[method];
    const result = util.promisify(func).bind(obj, ...rest);
    return result;
  },

  bind(obj, method, ...rest) {
    const func = typeof method === 'function' ? method : obj[method];
    const result = func.bind(obj, ...rest);
    return result;
  },

  boundOnce: new WeakMap(),

  bindOnce(to, obj, method, ...rest) {
    const func = typeof method === 'function' ? method : obj[method];
    let funcBinds = this.boundOnce.get(func);
    let result, map;
    const byRef = to && typeof to === 'object';

    if (!funcBinds) {
      funcBinds = Object.create(null);
      funcBinds.val = new Map();
      funcBinds.ref = new WeakMap();
      this.boundOnce.set(func, funcBinds);
      result = false;
    }

    map = byRef ? funcBinds.ref : funcBinds.val;

    if (result == null) {
      result = map.get(to);
    }

    if (!result) {
      result = func.bind(obj, ...rest);
      map.set(to, result);
    }

    return result;
  },

  bindJob(throwOpts, obj, method, ...rest) {
    const func = typeof method === 'function' ? method : obj[method];

    return async (...args) => {
      try {
        return await func.call(obj, ...rest, ...args);
      } catch (err) {
        if (obj.throw) obj.throw(err, throwOpts);
        else if (obj.$ && obj.$.throw) obj.$.throw(err, throwOpts);
        else this.$.throw(err, throwOpts);
      }
    };
  },

  async tick(arg) {
    await new Promise(resolve => setImmediate(resolve, arg));
  },

  async delay(msec, arg) {
    await new Promise(resolve => setTimeout(resolve, msec, arg));
  },

  async timeout(msec, err) {
    await new Promise((resolve, reject) => setTimeout(reject, msec, err || 'timeout'));
  },

  all(promises) {
    const promise = this.wrapNamed(promises, arr => Promise.all(arr));
    return promise;
  },

  race(promises) {
    const promise = this.wrapNamed(promises, arr => this.raceArray(arr), true);
    return promise;
  },

  raceChunk(promises, size) {
    const promise = this.wrapNamed(promises, arr => this.raceChunkArray(arr, size));
    return promise;
  },

  async wrapNamed(promises, aggr, single) {
    if (promises instanceof Array) return await aggr(promises);
    const names = Object.keys(promises);
    const arr = Object.values(promises);
    const results = await aggr(arr);
    if (single) return results;
    const object = this.$.makeObject(names.map((v, k) => ({[v]: results[k]})));
    return object;
  },

  raceDone(promise, error) {
    return (data) => {
      const map = this.raceMap.get(promise);
      if (!map) return;
      this.raceMap.delete(promise);
      promise[this.promiseIsError] = error;
      promise[this.promiseValue] = data;

      for (const trigger of map.keys()) {
        for (const submap of trigger.map.keys()) {
          submap.delete(trigger);
        }

        trigger.map.clear();
        delete trigger.map;
        const action = error ? trigger.reject : trigger.resolve;
        delete trigger.resolve;
        delete trigger.reject;
        action(data);
      }

      map.clear();
    };
  },

  raceArray(promises) {
    for (const promise of promises) {
      if (!(promise instanceof Promise)) return Promise.resolve(promise);

      if (this.promiseIsError in promise) {
        const data = promise[this.promiseValue];
        if (promise[this.promiseIsError]) return Promise.reject(data);
        return Promise.resolve(data);
      }
    }

    return this.racePending(promises);
  },

  racePending(promises) {
    let trigger;

    const result = new Promise((resolve, reject) => {
      trigger = {resolve, reject};
    });

    const tMap = new Map();
    trigger.map = tMap;

    for (const promise of promises) {
      let map = this.raceMap.get(promise);

      if (!map) {
        map = new Map();
        this.raceMap.set(promise, map);
        promise.then(this.raceDone(promise, false), this.raceDone(promise, true));
      }

      map.set(trigger, true);
      tMap.set(map, true);
    }

    return result;
  },

  async promiseIndexMap(promise, index, at) {
    try {
      const result = await promise;
      return {result, index, at};
    } catch (error) {
      return {error, index, at};
    }
  },

  PromiseError: function PromiseError({error}) {
    this.error = error;
  },

  async raceChunkArray(promises, size) {
    if (!size || !promises.length) return [];
    const results = Array(promises.length);
    const indexed = promises.slice(0, size).map((p, i) => this.promiseIndexMap(p, i, i));
    let next = size;
    const max = promises.length + size;

    do {
      const resp = await this.race(indexed.filter(this.echo));
      results[resp.index] = resp;
      const p = promises[next];
      indexed[resp.at] = p && this.promiseIndexMap(p, next, resp.at);
      if (++next >= max) break;
    } while (true);

    return results.map(res => 'error' in res ? new this.PromiseError(res) : res.result);
  },

  waitEvent(context, subs, throws) {
    const unsubs = [];

    const subone = (sub, func) => {
      const wfunc = (data, ...args) => func({event: sub, data, args});
      unsubs.push({sub, func: wfunc});

      (
        context.on ||
        context.addListener ||
        context.addEventListener
      ).call(context, sub, wfunc);
    };

    const unsuball = () => unsubs.forEach(v => (
      context.off ||
      context.removeListener ||
      context.removeEventListener
    ).call(context, v.sub, v.func));

    const promise = new Promise((resolve, reject) => {
      if (subs) {
        subs.split(',').forEach(ev => subone(ev, (e2) => {
          unsuball();
          resolve(e2);
        }));
      }

      if (throws) {
        throws.split(',').forEach(ev => subone(ev, (e2) => {
          unsuball();
          reject(e2);
        }));
      }
    });

    return promise;
  },

  timeThrottle(obj, time, callback) {
    if (!callback) { callback = time; time = null; }
    const cur = this.throttleMap.get(callback);

    const acc = (
      cur ? cur.acc :
      obj instanceof Array ? [] : Object.create(null)
    );

    this.$.accumulate(acc, obj);

    if (cur) {
      if (time) cur.time = time;
      return cur.finaled;
    }

    const newCur = {
      acc,
      time: time != null ? time : this.$.timeThrottleDefault || 1000
    };

    this.throttleMap.set(callback, newCur);
    return this.timeThrottleTimeout(callback);
  },

  async timeThrottleTimeout$(callback) {
    const cur = this.throttleMap.get(callback);
    const {acc, time} = cur;

    for (const key in acc) {
      cur.acc = acc instanceof Array ? [] : Object.create(null);

      try {
        delete cur.result;
        delete cur.error;
        const res = await callback(acc);
        cur.result = res;
        if (cur.ok) cur.ok(res); else return res;
      } catch (err) {
        cur.error = err;
        if (cur.nok) cur.nok(err); else throw err;
      } finally {
        cur.finaled = new Promise((ok, nok) => {
          cur.ok = ok;
          cur.nok = nok;
        });

        if (time) {
          setTimeout(this.timeThrottleTimeout, time, callback);
        } else {
          setImmediate(this.timeThrottleTimeout, callback);
        }
      }

      return;
    }

    this.throttleMap.delete(callback);
    if (cur.ok) cur.ok(null); else return null;
  },

  throttleMap: new WeakMap(),
  timeThrottleDefault: 1000,

  timeThrottleCached(obj, time, callback) {
    if (!callback) { callback = time; time = null; }
    const pending = this.$.throttleMap.get(callback);
    const promise = this.$.timeThrottle(obj, time, callback);
    if (!pending) return promise;
    if (pending.error) throw pending.error;
    return pending.result;
  },

  callOnce(fn) {
    const map = this.callOnceMap;
    if (map.has(fn)) return map.get(fn).promise;

    const promise = (async () => {
      try {
        const res = await fn();
        return res;
      } finally {
        map.delete(fn);
      }
    })();

    map.set(fn, {promise});
    return promise;
  },

  callOnceMap: new WeakMap(),

  IoC(config, hub) {
    const {IoCs} = this;
    if (IoCs.has(config)) return IoCs.get(config);
    const inst = new this(config, hub);
    IoCs.set(config, inst);
    return inst;
  },

  IoCs: new WeakMap(),

  raceMap: new Map(),
  promiseValue: Symbol('Clasync.promiseValue'),
  promiseIsError: Symbol('Clasync.promiseIsError')
}

module.exports = ClasyncPromise;
