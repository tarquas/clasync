const Clasync = require('..');

class MqDisp extends Clasync.Emitter {
  // mq -- message queue (class Mq) instance
  // prefix -- dispatcher group prefix

  static get type() { return 'mqDisp'; }

  async pub(event, data, opts) {
    const fullName = `${this._prefix}${event}`;
    return await this.mq.pub(fullName, data, opts);
  }

  async push(queue, data, opts) {
    const fullName = `${this._prefix}${queue}`;
    return await this.mq.push(fullName, data, opts);
  }

  async rpc(queue, data, opts) {
    const fullName = `${this._prefix}${queue}`;
    return await this.mq.rpc(fullName, data, opts);
  }

  sub(event, onData, opts) {
    const fullName = `${this._prefix}${event}`;
    return this.mq.sub(fullName, onData, opts);
  }

  worker(queue, onData, opts) {
    const fullName = `${this._prefix}${queue}`;
    return this.mq.worker(fullName, onData, opts);
  }

  rpcworker(queue, onData, opts) {
    const fullName = `${this._prefix}${queue}`;
    return this.mq.rpcworker(fullName, onData, opts);
  }

  async addHandler(action, customHandler) {
    const [ents, optsStr, subs, socket, queue] = action.match(this.$.rxSocketQueue) || [];
    if (!ents) return;
    const handler = customHandler || this[action];
    const func = this.mq[socket.toLowerCase()];
    if (!func) return;
    const fullName = `${this._prefix}${queue}`;

    let ac = this.handlers[action];
    if (!ac) this.handlers[action] = ac = [];
    const n = subs || 1;

    const opts = this.$.invert(optsStr.split(''));

    for (let i = 0; i < n; i++) {
      const handlerId = await func.call(this.mq, fullName, handler.bind(this), {
        important: '!' in opts,
        topic: '?' in opts
      });

      ac.push(handlerId);
    }
  }

  async removeHandler(action) {
    const handlers = this.handlers[action];
    if (handlers == null) return;

    for (const handlerId of handlers) {
      await this.mq.unhandle(handlerId);
    }

    delete this.handlers[action];
  }

  async removeAllHandlers() {
    for (const action in this.handlers) {
      if (Object.hasOwnProperty.call(this.handlers, action)) {
        await this.removeHandler(action); // eslint-disable-line
      }
    }
  }

  async init() {
    this._prefix = this.prefix || '';
    this.handlers = this.$.makeObject();
  }

  async afterInit() {
    for (const action of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      await this.addHandler(action); // eslint-disable-line
    }
  }

  async final() {
    await this.removeAllHandlers();
  }
}

MqDisp.rxSocketQueue = /^([!?]*)\s*(?:(\d+)\s*\*\s*)?(\w+)\s+(\S+)$/;

module.exports = MqDisp;
