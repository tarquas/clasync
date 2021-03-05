const Clasync = require('../..');
const {common} = Clasync.Db.Mongo;

class DbMongoModel extends Clasync.Emitter {
  // db -- database (class DbMongo) connection

  static get type() { return 'dbModel'; }

  async getById(_id) {
    const doc = await this.model.findOne({_id}).lean().exec();
    return doc;
  }

  static Schema = common.Schema;
  static Mixed = common.Schema.Types.Mixed;
  static ObjectId = common.ObjectId;

  Schema = this.$.Schema;
  Mixed = this.$.Mixed;
  ObjectId = this.$.ObjectId;
  errors = this.$.errors;

  async init() {
  }

  async afterInit() {
    const {schema} = this;
    if (!schema) throw new Error('schema is not defined');
    this._schema = await (typeof schema === 'function' ? schema.call(this) : schema);
    const {collection} = schema.options;
    if (!collection) throw new Error('collection is not defined');
    if (this.db.prefix) schema.options.collection = `${this.db.prefix}${collection}`;
    let {name} = this;
    if (!name) this.name = name = collection;
    this.model = this.Model = this.db.conn.model(name, schema);
  }
}

DbMongoModel.errors = {
  duplicate: 11000,
  cursorError: 1 // TODO:
};

module.exports = DbMongoModel;
