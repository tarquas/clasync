const Clasync = require('..');

class Db extends Clasync {
  static get Mongo() { return require('./mongo'); }
}

module.exports = Db;
