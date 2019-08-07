const Clasync = require('..');

class Mq extends Clasync {
  static get Mongo() { return require('./mongo'); }
  static get Discovery() { return require('./discovery'); }
  static get Disp() { return require('./disp'); }
}

module.exports = Mq;
