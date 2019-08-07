const Clasync = require('..');

class Pay extends Clasync {
  static get Stripe() { return require('./stripe'); }
}

module.exports = Pay;
