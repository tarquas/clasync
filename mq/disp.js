const Clasync = require('..');

class MqDisp extends Clasync {
  // mq -- message queue (class Mq) instance
  // prefix -- dispatcher group prefix

  static get type() { return 'mqDisp'; }

  async pub(event, data) {
    const fullName = `${this._prefix}${event}`;
    return await this.mq.pub(fullName, data);
  }

  async push(queue, data) {
    const fullName = `${this._prefix}${queue}`;
    return await this.mq.push(fullName, data);
  }

  async rpc(queue, data) {
    const fullName = `${this._prefix}${queue}`;
    return await this.mq.rpc(fullName, data);
  }

  sub(event, onData) {
    const fullName = `${this._prefix}${event}`;
    return this.mq.sub(fullName, onData);
  }

  worker(queue, onData) {
    const fullName = `${this._prefix}${queue}`;
    return this.mq.worker(fullName, onData);
  }

  rpcworker(queue, onData) {
    const fullName = `${this._prefix}${queue}`;
    return this.mq.rpcworker(fullName, onData);
  }

  async addHandler(action, customHandler) {
    const [ents, socket, queue] = action.match(this.$.rxSocketQueue) || [];
    if (!ents) return;
    const handler = customHandler || this[action];
    const func = this.mq[socket.toLowerCase()];
    if (!func) return;
    const fullName = `${this._prefix}${queue}`;
    const handlerId = await func.call(this.mq, fullName, handler.bind(this));
    this.handlers[action] = handlerId;
  }

  async removeHandler(action) {
    const handlerId = this.handlers[action];
    if (handlerId == null) return;
    await this.mq.unhandle(handlerId);
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
    this.handlers = {};

    for (const action of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      await this.addHandler(action); // eslint-disable-line
    }
  }

  async final() {
    await this.removeAllHandlers();
  }
}

MqDisp.rxSocketQueue = /^(\w+)\s+(\S+)$/;

module.exports = MqDisp;
