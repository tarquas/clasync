const Clasync = require('../..');

class DbMongoModel extends Clasync.Emitter {
  // db -- database (class DbMongo) connection

  static get type() { return 'dbModel'; }

  async getById(_id) {
    const doc = await this.model.findOne({_id}).lean().exec();
    return doc;
  }

  async init() {
    this.Schema = this.db.common.Schema;
    this.Mixed = this.Schema.Types.Mixed;
    this.errors = this.$.errors;

    const {schema} = this;
    this._schema = schema;
    const {collection} = schema.options;
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
