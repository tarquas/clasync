const Clasync = require('..');
const stripe = require('stripe');
const util = require('util');

class Pay extends Clasync {
  // key: Stripe secret key (sk_...)

  static get type() { return 'pay'; }

  static promisify(from, to = {}) {
    for (const key of Reflect.ownKeys(from)) {
      if (key.match(this.rxPrivateField)) continue;
      const what = from[key];
      if (typeof what === 'function') to[key] = util.promisify(what).bind(from);
      else if (typeof what === 'object') to[key] = this.promisify(what);
      else to[key] = what;
    }

    return to;
  }

  async init() {
    this.stripe = stripe(this.key);
    this.$.promisify(this.stripe, this);
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
