const Clasync = require('..');
const stripe = require('stripe');

class Pay extends Clasync.Emitter {
  // key: Stripe secret key (sk_...)

  static get type() { return 'pay'; }

  static promisifyAll(from, to = {}) {
    for (const key of Reflect.ownKeys(from)) {
      if (key.match(this.rxPrivateField)) continue;
      const what = from[key];
      if (typeof what === 'function') to[key] = this.$.promisify(from, what);
      else if (typeof what === 'object') to[key] = this.$.promisifyAll(what);
      else to[key] = what;
    }

    return to;
  }

  async init() {
    this.stripe = stripe(this.key, this.opts);
    this.$.promisifyAll(this.stripe, this);
    await this.disputes.list();
  }

  async final() {
    this.stripe = null;

    for (const key of Reflect.ownKeys(stripe)) {
      delete this[key];
    }
  }
}

Pay.rxPrivateField = /^_/;

module.exports = Pay;
