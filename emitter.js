const Clasync = require('.');
let $;

class ClasyncEmitter extends Clasync {
  async init() {
    $.emitterEvents.set(this, this.$.makeObject());
  }

  async final() {
    this.off();
  }

  on(event, handler, stage) {
    const _emitterEvents = $.emitterEvents.get(this);
    if (event == null) return Object.keys(_emitterEvents);
    let emitterEvents = _emitterEvents[event];
    let handlers;
    let byStages;
    let stages;

    if (!emitterEvents) {
      handlers = new Map();
      byStages = this.$.makeObject();
      stages = [];
      _emitterEvents[event] = emitterEvents = {handlers, byStages, stages};
    } else {
      ({handlers, byStages, stages} = emitterEvents);
    }

    const h = handler;
    if (!h) return Array.from(handlers.entries());
    if (handlers.has(h)) return h;

    const s = stage === true ? -1 : (+stage || 0);
    let byStage = byStages[s];

    if (!byStage) {
      byStages[s] = byStage = new Map();
      const idx = stages.findIndex(v => v > s);
      if (idx < 0) stages.push(s); else stages.splice(idx, 0, s);
    }

    handlers.set(h, s);
    byStage.set(h, true);
    return h;
  }

  off(event, handler) {
    const _emitterEvents = $.emitterEvents.get(this);

    if (event == null) {
      for (const event of Object.keys(_emitterEvents)) {
        this.off(event);
      }

      return true;
    }

    const emitterEvents = _emitterEvents[event];
    if (!emitterEvents) return false;
    const {handlers, byStages, stages} = emitterEvents;

    const h = handler;

    if (!h) {
      handlers.clear();

      for (const [stage, byStage] of Object.entries(byStages)) {
        byStage.clear();
        delete byStages[stage];
      }

      stages.length = 0;
      delete _emitterEvents[event];
      return true;
    }

    if (!handlers.has(h)) return false;
    const s = handlers.get(h);
    const byStage = byStages[s];
    byStage.delete(h);

    if (!byStage.size) {
      delete byStages[s];
      stages.splice(stages.indexOf(s), 1);
    }

    handlers.delete(h);
    if (!handlers.size) delete _emitterEvents[event];
    return true;
  }

  onAny(handler, stage) {
    return this.on('', handler, stage);
  }

  offAny(handler) {
    return this.off('', handler);
  }

  emit(event, ...args) {
    if (event == null || event === '') return $.emitEvent(this, '', ...args);
    const res = $.emitEvent(this, event, ...args);

    if (res instanceof Promise) return (async () => {
      if (res) return res;
      return await $.emitEvent(this, '', {event, args});
    })();

    if (res) return res;
    return $.emitEvent(this, '', {event, args});
  }
}

$ = Clasync.private({
  emitterEvents: new WeakMap(),

  emitEvent(event, ...args) {
    const _emitterEvents = $.emitterEvents.get(this);
    const emitterEvents = _emitterEvents[event];
    if (!emitterEvents) return false;
    const {byStages, stages} = emitterEvents;

    let stagei;
    let result;

    for (stagei = 0; stagei < stages.length; stagei++) {
      const entries = Array.from(byStages[stages[stagei]].entries());
      result = $.emitHandlers(this, entries, ...args);
      if (result instanceof Promise) break;
      if (this.$.hasKeys(result)) return result;
    }

    if (stagei < stages.length) return (async () => {
      let res = await result;
      if (this.$.hasKeys(res)) return res;

      for (stagei++; stagei < stages.length; stagei++) {
        const entries = Array.from(byStages[stages[stagei]].entries());
        res = await $.emitHandlers(this, entries, ...args);
        if (this.$.hasKeys(res)) return res;
      }

      return false;
    })();

    return false;
  },

  emitHandlers(entries, ...args) {
    const promises = entries.map(([handler]) => handler(...args));

    for (const promise of promises) {
      if (promise instanceof Promise) return (async () => {
        const results = await Clasync.all(promises);
        return $.reduce(this, results);
      })();
    }

    return $.reduce(this, promises);
  },

  reduce(results) {
    const result = results.map((v) => (
      !v ? null :
      typeof v === 'object' ? v :
      typeof v === 'function' ? v() :
      {[v]: true}
    )).reduce((v1, v2) => Object.assign(v1, v2), this.$.makeObject());

    return result;
  }
});

module.exports = ClasyncEmitter;
