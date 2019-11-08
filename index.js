const ClasyncError = require('./static/error');
const ClasyncPromise = require('./static/promise');
const ClasyncMain = require('./static/main');
const ClasyncFunc = require('./static/func');

class Clasync extends ClasyncBase {
  static get $() { return this; }

  static get Db() { return require('./db'); }
  static get Mq() { return require('./mq'); }
  static get Pay() { return require('./pay'); }
  static get Thread() { return require('./thread'); }
  static get Web() { return require('./web'); }
  static get Worker() { return require('./worker'); }

  static get Cache() { return require('./cache'); }
  static get Crypt() { return require('./crypt'); }
  static get Emitter() { return require('./emitter'); }

  static async setMainInstance(inst) {
    Clasync.mainInstance = inst;
  }

  static async subSet(sub) {
    const inst = this[Clasync.instance];
    if (!inst || !sub || typeof sub !== 'object') return;

    await Promise.all(Object.entries(sub).map(async ([k, v]) => {
      if (!(v instanceof Array) || !Object.isPrototypeOf.call(Clasync, v[0])) {
        this[k] = v;
        await v[Clasync.ready];
        return;
      }

      const [Class, config] = v;
      const type = this.$.type;
      const parent = type ? {[type]: this} : {};
      const subConfig = {...parent, ...config};
      const newInst = this[k] = new Class(subConfig, inst.$$);
      await newInst[Clasync.ready];
    }));
  }

  static async isFinal(t) {
    const inst = this.get(await t[Clasync.ready], Clasync.instance);
    return inst.final;
  }

  static async finish(t, reasonOrig) {
    const inst = this.get(t, Clasync.instance);
    if (!inst || inst.final) return;

    let reason = reasonOrig;

    inst.final = true;
    inst.setFinal(reason);

    if (!inst.inited) await inst.waitInited;

    for (let p, o = t; o.beforeFinal; p = o.beforeFinal, o = Object.getPrototypeOf(o)) {
      if (o.beforeFinal !== p) try {
        const newReason = await o.beforeFinal.call(t, reason);
        if (newReason != null) reason = newReason;
      } catch (err) {
        this.throw(err, 'FINALIZER ERROR');
      }
    }

    const from = t;

    await this.all(Object.entries(from).map(async ([key, sub]) => {
      const subInst = this.get(sub, Clasync.instance);
      if (!subInst || subInst.detached) return;
      if (subInst.id <= inst.id) return;
      await this.finish(sub, reason);
      delete from[key];
    }));

    for (let p, o = t; o.final; p = o.final, o = Object.getPrototypeOf(o)) {
      if (o.final !== p) try {
        await o.final.call(t, reason);
      } catch (err) {
        this.throw(err, 'FINALIZER ERROR');
      }
    }

    inst.finaled = true;
    inst.setFinaled(reason);
  }

  static sub(config) {
    return [this, config];
  }

  static new(config) {
    return this.sub(config);
  }
}

function ClasyncBase(config, $$) {
  Object.defineProperty(
    this,
    Clasync.ready,

    {
      writable: false,
      value: ClasyncCtor(Object.assign(this, config), $$)
    }
  );
}

async function ClasyncCtor(t, $$) {
  try {
    const inits = [];
    const afterInits = [];

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

    await t.$.tick();

    for (let o = t; o.init; o = Object.getPrototypeOf(o)) {
      if (o.init !== inits[0]) inits.unshift(o.init);
    }

    for (let o = t; o.afterInit; o = Object.getPrototypeOf(o)) {
      if (o.afterInit !== afterInits[0]) afterInits.unshift(o.afterInit);
    }

    const sub = Clasync.subSet.bind(t);

    for (const init of inits) {
      const subObj = await init.call(t, sub);
      if (subObj) await sub(subObj);
    }

    for (const afterInit of afterInits) {
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

module.exports = Clasync;

Clasync.App = class App extends Clasync.Emitter {
  static get type() { return 'app'; }
  static configure() { return {}; }
};

Clasync.autorun(require.main).catch(err => Clasync.logFatal(err));
