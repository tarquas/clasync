const ClasyncError = require('./static/error');
const ClasyncPromise = require('./static/promise');
const ClasyncMain = require('./static/main');
const ClasyncFunc = require('./static/func');

class Clasync extends ClasyncBase {
  static async subSet(sub) {
    const inst = this[Clasync.instance];
    if (!inst || !sub || typeof sub !== 'object') return;

    await Promise.all(Object.entries(sub).map(async ([k, v]) => {
      if (!(v instanceof Array) || !Object.isPrototypeOf.call(Clasync, v[0])) {
        this[k] = v;
        this[k] = await v;
        return;
      }

      const [Class, config] = v;
      const type = this.$.type;
      const parent = type ? {[type]: this} : {};
      const subConfig = {...parent, ...config};
      this[k] = new Class(subConfig, inst.$$);
      this[k] = await this[k];
    }));
  }

  static async isFinal(t) {
    const inst = this.get(await t, Clasync.instance);
    return inst.final;
  }

  static async finish(t, reason) {
    const inst = this.get(t, Clasync.instance);
    if (!inst || inst.final) return;
    inst.final = true;
    inst.setFinal(reason);
    if (!inst.inited) await inst.waitInited;
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
}

async function ClasyncCtor(t, $$) {
  const inits = [];
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

  const sub = Clasync.subSet.bind(t);

  for (const init of inits) {
    const subObj = await init.call(t, sub);
    if (subObj) await sub(subObj);
  }

  inst.inited = true;
  inst.setInited(true);
  return t;
}

function ClasyncBase(config, $$) {
  return ClasyncCtor(Object.assign(this, config), $$);
}

Object.assign(Clasync, ClasyncError);
Object.assign(Clasync, ClasyncPromise);
Object.assign(Clasync, ClasyncMain);
Object.assign(Clasync, ClasyncFunc);

Clasync.instance = Symbol('Clasync.instance');
Clasync.nextId = 1;

module.exports = Clasync;

Clasync.autorun(require.main).catch(console.error);
