const {$, Emitter} = require('..');

class MqDisp extends Emitter {
  // mq -- message queue (class Mq) instance
  prefix = '';  // dispatcher group prefix

  static type = 'mqDisp';

  pub(event, data, opts) {
    const fullName = `${this.mq.prefix}${this.prefix}${event}`;
    return this.mq.pub(fullName, data, opts);
  }

  push(queue, data, opts) {
    const fullName = `${this.mq.prefix}${this.prefix}${queue}`;
    return this.mq.push(fullName, data, opts);
  }

  rpc(queue, data, opts) {
    const fullName = `${this.mq.prefix}${this.prefix}${queue}`;
    return this.mq.rpc(fullName, data, opts);
  }

  sub(event, onData, opts) {
    const fullName = `${this.mq.prefix}${this.prefix}${event}`;
    return this.mq.sub(fullName, onData, opts);
  }

  worker(queue, onData, opts) {
    const fullName = `${this.mq.prefix}${this.prefix}${queue}`;
    return this.mq.worker(fullName, onData, opts);
  }

  rpcworker(queue, onData, opts) {
    const fullName = `${this.mq.prefix}${this.prefix}${queue}`;
    return this.mq.rpcworker(fullName, onData, opts);
  }

  async addHandler(action, handler) {
    const match = action.match(this.$.rxAction);
    if (!match) return;
    const [, optsStr, subs, method, queue] = match;

    const func = this[method.toLowerCase()];
    if (!func) return;

    let ac = this.handlers[action];
    if (!ac) this.handlers[action] = ac = [];
    const n = subs || 1;

    const opts = this.$.invert(optsStr.split(''));
    const cOpts = {important: '!' in opts, topic: '?' in opts};

    const hids = await $.all($.mapIter($.rangeIter(n), async () => {
      const handlerId = await func.call(this, queue, handler.bind(this), cOpts);
      return handlerId;
    }));

    ac.push(...hids);
  }

  async removeHandler(action) {
    const handlers = this.handlers[action];
    if (handlers == null) return;

    await $.all($.mapIter(handlers, async (handlerId) => {
      await this.mq.unhandle(handlerId);
    }));

    delete this.handlers[action];
  }

  async removeAllHandlers() {
    await $.all($.mapIter($.keys(this.handlers), async (action) => {
      await this.removeHandler(action);
    }));
  }

  async init() {
    this.handlers = $.make();
  }

  static rxAction = /^([!?]*)\s*(?:(\d+)\s*\*\s*)?(\w+)\s+(\S+)$/;

  static actionDesc = {
    rxName: /^[!?\s\d\*]*(sub|worker|rpcworker)\s/i,
    rxType: /^function$/
  };

  async afterInit() {
    await $.all($.mapIter($.entries($.scanObjectAll(this, this.$.actionDesc)), async ([action, handler]) => {
      await this.addHandler(action, handler);
    }));
  }

  async final() {
    await this.removeAllHandlers();
  }
}

module.exports = MqDisp.$;
