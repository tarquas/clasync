const ClasyncError = require('./static/error');
const ClasyncPromise = require('./static/promise');
const ClasyncMain = require('./static/main');
const ClasyncFunc = require('./static/func');

class Clasync extends ClasyncBase {
  static get Db() { return require('./db'); }
  static get Mq() { return require('./mq'); }
  static get Pay() { return require('./pay'); }
  static get Thread() { return require('./thread'); }
  static get Web() { return require('./web'); }
  static get Worker() { return require('./worker'); }

  static get Cache() { return require('./cache'); }
  static get Crypt() { return require('./crypt'); }
  static get Emitter() { return require('./emitter'); }

  static get $() {
    if (!Clasync.staticSelfBound.has(this)) {
      for (let o = this; o; o = Object.getPrototypeOf(o)) {
        bind$(this, o);
      }

      Clasync.staticSelfBound.set(this, true);
    }

    return this;
  }

  static async setMainInstance(inst) {
    Clasync.mainInstance = inst;
  }

  static async subSetDep([k, v]) {
    if (typeof v === 'function') {
      v = await v.call(this, k);
    }

    if (typeof v !== 'object') {
      this[k] = v;
      return;
    }

    if (v instanceof Array && Object.isPrototypeOf.call(Clasync, v[0])) {
      const inst = this[Clasync.instance];
      const [Class, config] = v;
      const type = this.$.type;
      const parent = type ? {[type]: this} : {};
      const subConfig = {...parent, ...config};
      const newInst = this[k] = new Class(subConfig, inst.$$);
      this.$[k] = Class;
      await newInst[Clasync.ready];
      return;
    }

    if (v instanceof Promise) {
      this[k] = v;
      this[k] = await this[k];
      return;
    }

    this[k] = v;

    if (v instanceof Clasync) {
      this.$[k] = v.$;
      await v[Clasync.ready];
    }
  }

  static async subSetOne(sub) {
    if (!sub) return;
    const inst = this[Clasync.instance];
    if (!inst) return;

    if (typeof sub === 'function') sub = await sub.call(this);
    if (typeof sub !== 'object') return;
    if (sub instanceof Promise) sub = await sub;

    await Promise.all(Object.entries(sub).map(dep => Clasync.subSetDep.call(this, dep)));
  }

  static async subSet(...sub) {
    await Clasync.all(Clasync.flattenDeep(sub).map(s => Clasync.subSetOne.call(this, s)));
  }

  static isFinal$(t) {
    const inst = this.get(t, Clasync.instance);
    return inst.final;
  }

  static mainFinal$() {
    return this.isFinal(this.mainInstance);
  }

  static async finish(t, reasonOrig) {
    const inst = this.get(t, Clasync.instance);
    if (!inst || inst.final) return;

    let reason = reasonOrig;

    inst.final = true;
    inst.setFinal(reason);

    if (!inst.inited) try {
      await t[this.ready];
    } catch (err) {
      inst.initError = true;
    }

    for (let p, o = t; o.beforeFinal; p = o.beforeFinal, o = Object.getPrototypeOf(o)) {
      if (o.beforeFinal !== p) try {
        const newReason = await o.beforeFinal.call(t, reason);
        if (newReason != null) reason = newReason;
      } catch (err) {
        this.throw(err, 'FINALIZER ERROR');
      }
    }

    if (t === this.mainInstance && !this.mainInstance.suppressCrash && reason) {
      this.throw(reason, 'MAIN SHUTDOWN');
    }

    const from = t;

    await this.all(Object.entries(from).map(async ([key, sub]) => {
      const subInst = this.get(sub, Clasync.instance);
      if (!subInst || subInst.detached) return;
      if (subInst.id <= inst.id) return;
      await this.finish(sub, reason);
      delete from[key];
    }));

    //if (!inst.initError)
    for (let p, o = t; o.final; p = o.final, o = Object.getPrototypeOf(o)) {
      if (o.final !== p) try {
        await o.final.call(t, reason);
      } catch (err) {
        this.throw(err, 'FINALIZER ERROR');
      }
    }

    inst.finaled = true;
    inst.setFinaled(reason);
    if (t === this.mainInstance) this.mainInstance = null;
  }

  static sub(config) {
    return [this, config];
  }

  static new(config) {
    return this.sub(config);
  }
}

function ClasyncBase(config, $$) {
  const ready = ClasyncCtor(Object.assign(this, config), config, $$);
  Object.defineProperty(this, Clasync.ready, {writable: false, value: ready});
}

async function ClasyncCtor(t, cfg, $$) {
  try {
    const inits = [];
    const afterInits = [];
    const up = [];

    const inst = {createdAt: new Date(), id: Clasync.nextId++, init$$: !$$, $$};
    inst.waitInited = new Promise((resolve) => { inst.setInited = resolve; });
    inst.waitFinal = new Promise((resolve) => { inst.setFinal = resolve; });
    inst.waitFinaled = new Promise((resolve) => { inst.setFinaled = resolve; });
    if (!$$) inst.$$ = t;

    Object.defineProperties(t, {
      [Clasync.instance]: {value: inst},
      $$: {value: inst.$$},
      $: {value: t.constructor}
    });

    await t.$.$.tick();
    Object.assign(t, cfg);

    for (let o = t; o; o = Object.getPrototypeOf(o)) {
      up.unshift(o);
      if (Object.hasOwnProperty.call(o, 'init')) inits.unshift(o.init);
      if (Object.hasOwnProperty.call(o, 'afterInit')) afterInits.unshift(o.afterInit);
    }

    const sub = Clasync.subSet.bind(t);

    for (const o of up) {
      bind$(t, o);
    }

    for (const init of inits) {
      if (typeof init !== 'function') continue;
      const subObj = await init.call(t, sub);
      if (subObj) await sub(subObj);
    }

    for (const afterInit of afterInits) {
      if (typeof afterInit !== 'function') continue;
      const subObj = await afterInit.call(t, sub);
      if (subObj) await sub(subObj);
    }

    inst.inited = true;
    inst.setInited(true);

    return t;
  } catch (err) {
    if (t.initFatal) {
      const obj = await t.initFatal(err);
      return obj || t;
    } else throw err;
  }
}

Object.assign(Clasync, ClasyncError);
Object.assign(Clasync, ClasyncPromise);
Object.assign(Clasync, ClasyncMain);
Object.assign(Clasync, ClasyncFunc);

Clasync.instance = Symbol('Clasync.instance');
Clasync.ready = Symbol('Clasync.ready');
Clasync.nextId = 1;
Clasync.debugMode = process.env.DEBUG;
Clasync.debugTopics = (Clasync.debugMode || '').toString().match(Clasync.rxNestIds) || [];
Clasync.debugIndex = Clasync.invert(Clasync.debugTopics);

Clasync.rxSelfBind = /^([^]+)\$$/;
Clasync.staticSelfBound = new WeakMap();

function bind$(obj, inst) {
  for (const name of Object.getOwnPropertyNames(inst)) {
    const ents = name.match(Clasync.rxSelfBind);
    if (!ents) continue;
    const func = inst[name];
    if (typeof func !== 'function') continue;
    inst[ents[1]] = func.bind(obj);
  }
}

module.exports = Clasync.$;

Clasync.App = class App extends Clasync.Emitter {
  static type = 'app';
  static configure = {};
};

Clasync.autorun().catch(err => Clasync.logFatal(err));
