const Clasync = require('../..');
const Crypt = require('../../crypt');
const mongoose = require('mongoose');

// mongoose.Promise = Promise;

class DbMongo extends Clasync {
  // connString : MongoDB connection string
  // connOpts [optional] : MongoDB connection options
  // prefix [optional] : prefix to collections

  static get type() { return 'db'; }

  static get Model() { return require('./model'); }

  static newObjectId() {
    const objectId = this.ObjectId();
    return objectId;
  }

  newObjectId(...args) {
    return this.$.newObjectId(...args);
  }

  static newShortId() {
    const objectId = this.newObjectId();
    const shortId = this.toShortId(objectId);
    return shortId;
  }

  newShortId(...args) {
    return this.$.newShortId(...args);
  }

  static toShortId(objectId) {
    const hex = objectId.toString().padStart(24, '0');
    const base64 = Buffer.from(hex, 'hex').toString('base64');
    const shortId = Crypt.toUrlSafe(base64);
    return shortId;
  }

  toShortId(...args) {
    return this.$.toShortId(...args);
  }

  static fromShortId(shortId) {
    const base64 = Crypt.fromUrlSafe(shortId);
    const hex = Buffer.from(base64, 'base64').toString('hex');
    const objectId = new this.ObjectId(hex);
    return objectId;
  }

  fromShortId(...args) {
    return this.$.fromShortId(...args);
  }

  async init() {
    this.common = this.$.common;

    if (!this.connString) throw new Error('MongoDB Connection string is not specified');
    if (!this.connOpts) this.connOpts = {};
    if (!this.prefix) this.prefix = '';

    Object.assign(this.connOpts, {
      // useMongoClient: true,
      useCreateIndex: true,
      useFindAndModify: false,
      useUnifiedTopology: true,
      ...this.$.hardOptions
    });

    this.conn = await this.common.createConnection(
      this.connString,
      this.connOpts
    );
  }

  async final() {
    if (!this.conn) return;
    this.conn.close();
    this.conn = null;
  }
}

DbMongo.common = mongoose;
DbMongo.Types = mongoose.Types;
DbMongo.ObjectId = mongoose.Types.ObjectId;

DbMongo.hardOptions = {
  useNewUrlParser: true,
  autoReconnect: true,
  bufferMaxEntries: 0
};

module.exports = DbMongo;
