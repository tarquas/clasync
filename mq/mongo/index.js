const Clasync = require('../..');
const DbMongo = require('../../db/mongo');
const DbMongoModel = require('../../db/mongo/model');
const util = require('util');

class MqMongoModel extends DbMongoModel {
  get schema() {
    return new this.Schema({
      _id: String,
      date: Date,
      expires: {type: Date, expires: 1},
      queue: String,
      message: this.Schema.Types.Mixed
    }, {
      collection: this.mq.queueName
    })
      .index({queue: 1, date: 1})
      .index({date: 1});
  }  
}

class MqMongo extends Clasync {
  // db - DbMongo instance to use for queues or config to create DbMongo
  // capDb - DbMongo instance to use for events or config to create DbMongo

  static get type() { return 'mq'; }

  get pubsubName() { return 'pubsub'; }
  get queueName() { return 'pubsubQueue'; }
  get queueEventName() { return 'queue:newTask'; }

  async pub(event, payload) {
    if (this.finishing) return null;
    if (this.waitPubsubReady) await this.waitPubsubReady;

    const inserted = await util.promisify(this.pubsubColl.insert).call(
      this.pubsubColl,
      {event, message: payload},
      {safe: true}
    );

    return inserted;
  }

  sub(event, onData) {
    if (this.finishing) return null;
    const workerId = this.workerIdNext++;

    let subHandlers = this.subs[event];
    if (!subHandlers) this.subs[event] = subHandlers = {};

    const object = {
      sub: event
    };

    subHandlers[workerId] = onData;
    this.workers[workerId] = object;
    return workerId;
  }

  async signalQueue(queue) {
    const inserted = await this.pub(this.queueEventName, queue);
    return inserted;
  }

  async push(queue, payload, opts = {}) {
    if (this.finishing) return null;
    if (this.waitPubsubReady) await this.waitPubsubReady;

    const id = this.db.newShortId();
    const now = new Date();

    if (opts.temp) {
      opts.expires = new Date(+now + this.$.visibilityMsec);
    }

    const item = new this.Model({
      _id: id,
      queue,
      message: payload,
      date: now,
      expires: opts.expires
    });

    await item.save();
    await this.signalQueue(queue);
    return item;
  }

  async remove(id) {
    const removed = await this.model.remove({_id: id}).exec();
    return removed;
  }

  async requeue(id) {
    const now = new Date();

    const item = await this.model.findOneAndUpdate(
      {_id: id},
      {$set: {date: now}},
      {select: {queue: 1}}
    ).lean().exec();

    await this.signalQueue(item.queue);
    return item;
  }

  async extend(id) {
    const now = +new Date();

    await this.model.update(
      {_id: id},
      {$set: {expires: new Date(now + this.$.visibilityMsec)}}
    ).exec();
  }

  async hide(id) {
    const now = +new Date();

    await this.model.update(
      {_id: id},
      {$set: {date: new Date(now + this.$.visibilityMsec)}}
    ).exec();
  }

  async workerProlongVisibility(object) {
    if (object.halt) return;

    if (object.id) {
      await this.hide(object.id);
    }

    if (object.halt) return;

    object.prolong = setTimeout(
      this.workerProlongVisibilityBound,
      this.$.prolongMsec,
      object
    );
  }

  takeFreeWorker(queue) {
    const free = this.freeWorkers[queue];
    if (!free) return false;

    for (const workerId in free) {
      const worker = this.workers[+workerId];
      delete free[workerId];

      if (worker.resume) worker.resume();

      for (const id in free) {
        return true;
      }

      delete this.freeWorkers[queue];

      return true;
    }

    return false;
  }

  setFreeWorker(workerId) {
    const worker = this.workers[workerId];
    if (!worker) return false;
    const {queue} = worker;
    let free = this.freeWorkers[queue];
    if (!free) this.freeWorkers[queue] = free = {};
    free[`+${workerId}`] = true;
    return true;
  }

  worker(queue, onData) {
    const workerId = this.workerIdNext++;

    const object = {
      resume: null,
      wait: null,
      halt: false,
      queue: null,
      id: null,
      prolong: null
    };

    this.workers[workerId] = object;

    object.promise = new Promise(async (resolve, reject) => { // eslint-disable-line
      try {
        object.queue = queue;

        loop: while (!object.halt) { // eslint-disable-line
          if (!object.resume) {
            object.wait = new Promise((resume) => {
              object.resume = resume;
            });
          }

          const now = +new Date();

          const item = await this.model.findOneAndUpdate(
            {queue, date: {$lt: new Date(now + this.$.accuracyMsec)}},
            {$set: {date: new Date(now + this.$.visibilityMsec)}},
            {sort: {date: 1}}
          ).lean().exec();

          if (!item) {
            this.setFreeWorker(workerId);

            await object.wait;

            object.resume = null;
            object.wait = null;
            continue;
          }

          object.id = item._id;

          if (object.halt) {
            await this.requeue(object.id);
            return;
          }

          object.prolong = setTimeout(
            this.workerProlongVisibilityBound,
            this.$.prolongMsec,
            object
          );

          try {
            const decoded = item.message;

            try {
              if (await onData.call(this, decoded) !== false) {
                await this.remove(object.id);
              } else {
                await this.requeue(object.id);
              }
            } catch (err) {
              await this.requeue(object.id);

              if (!(await this.error(err, {
                id: queue,
                msg: item.message,
                type: 'WORKER'
              }))) throw err;
            }
          } finally {
            object.id = null;
            clearTimeout(object.prolong);
          }
        }
      } catch (err) {
        this.unhandle(workerId);
        reject(err);
      }
    });

    object.promise.catch((err) => {
      this.error(err, {id: 'global', msg: '', type: 'WORKER'});
    });

    return workerId;
  }

  async rpc(queue, payload) {
    if (this.finishing) return undefined;
    const rpcId = this.db.newShortId();

    let response;
    const waitResponse = new Promise((resolve) => { response = resolve; });
    let timer;

    const waitTimer = new Promise((resolve) => {
      timer = setTimeout(resolve, this.$.visibilityMsec);
    });

    const workerId = this.sub(rpcId, response);
    await this.push(queue, {rpcId, args: payload});

    const msg = await this.race([
      waitResponse,
      waitTimer,
      this.waitTerminate
    ]);

    clearTimeout(timer);
    this.unhandle(workerId);
    return msg;
  }

  rpcworker(queue, onData) {
    const workerId = this.worker(queue, async (msg) => {
      const result = await onData.call(this, msg.args);
      await this.pub(msg.rpcId, result);
    });

    return workerId;
  }

  async unhandle(workerId) { // eslint-disable-line
    const object = this.workers[workerId];
    if (!object) return;

    object.halt = true;
    delete this.workers[workerId];

    if (object.prolong) {
      clearTimeout(object.prolong);
      object.prolong = null;
    }

    if (object.resume) {
      object.resume();
    }

    if (object.id) {
      // await this.requeue(object.id);
      // TODO: consider whether should requeue with worker in progress
    }

    if (object.subwait) object.subwait.resolve();

    if (object.sub) {
      const subHandlers = this.subs[object.sub];

      if (subHandlers) {
        delete subHandlers[workerId];

        for (const id in subHandlers) { // eslint-disable-line
          object.sub = null;
          break;
        }

        if (object.sub) {
          delete this.subs[object.sub];
          object.sub = null;
        }
      }
    }
  }

  async error(err, {id, type}) {
    if (!this.errorSilent) this.$.throw(err, `MQ ${type.toUpperCase()} ${id}`);
    return true;
  }

  async info(queue) {
    const count = await this.model.find({queue}).count().exec();
    const result = {messageCount: count};
    return result;
  }

  async deleteIfSafe() {
    // STUB: if safe it's like autodeleted by arch
  }

  async pubsubLoop() { // eslint-disable-line
    let prevErr = null;

    while (!this.finishing) {
      try {
        const {db} = this.capDb.conn;
        let coll = this.pubsubColl;

        if (!coll) {
          coll = await util.promisify(db.createCollection).call(
            db,
            this.pubsubName,

            {
              capped: true,
              autoIndexId: true,
              size: this.$.pubsubCapSize,
              strict: false
            }
          );

          this.pubsubColl = coll;
          this.pubsubCollReady();
          this.pubsubCollReady = null;
          this.waitPubsubCollReady = null;
        }

        const query = coll.find(
          this.latest ? {_id: this.latest._id } : null,
          {timeout: false}
        ).sort({_id: -1}).limit(1);

        try {
          this.latest = await util.promisify(query.next).call(query);
        } finally {
          query.close();
        }

        if (!this.latest) {
          const docs = await util.promisify(coll.insert).call(coll, {dummy: true}, {safe: true});
          [this.latest] = docs.ops;
        }

        if (this.pubsubReady) {
          this.pubsubReady();
          this.pubsubReady = null;
          this.waitPubsubReady = null;
        }

        if (this.finishing || this.capDb.conn._closeCalled) return;

        const cursor = coll.find(
          { _id: { $gt: this.latest._id }},

          {
            tailable: true,
            awaitData: true,
            timeout: false,
            sortValue: {$natural: -1},
            numberOfRetries: Number.MAX_VALUE,
            tailableRetryInterval: this.$.tailableRetryInterval
          }
        );

        try {
          while (!this.finishing) {
            this.latest = await this.$.race([
              util.promisify(cursor.next).call(cursor),
              this.waitTerminate
            ]);

            if (!this.latest) break;

            const {event, message} = this.latest;

            (async () => { // eslint-disable-line
              const subHandlers = this.subs[event];

              if (subHandlers) {
                for (const workerId in subHandlers) {
                  const worker = this.workers[workerId];
                  if (!worker) continue;

                  try {
                    let wait = this.subWait[event];
                    if (wait) await wait.promise;
                    if (this.finishing) return delete this.subWait[event];
                    let process = subHandlers[workerId].call(this, message);

                    if (process instanceof Promise) {
                      this.subWait[event] = wait = {};
                      worker.subwait = wait;
                      wait.promise = new Promise((resolve) => { wait.resolve = resolve; });
                      process = await process;
                      worker.subwait = null;
                      wait.resolve();
                    }

                    delete this.subWait[event];
                    if (process === false) break;
                  } catch (err) {
                    if (!(await this.error(err, {
                      id: event,
                      msg: message,
                      type: 'SUB'
                    }))) break;
                  }
                }
              }

              return true;
            })()
              .catch((err) => {
                this.$.throw(err, 'MQ PubSub Handler Fail');
              });
          }
        } finally {
          cursor.close();
        }

        break;
      } catch (err) {
        if (this.$.get(this.capDb, 'conn', '_closeCalled')) return;

        if (prevErr !== err.stack) {
          this.$.throw(err, 'MQ PubSub Loop Error');
        }

        prevErr = err.stack;
        await this.$.delay(this.$.pubsubRetryMsec);
        continue;
      }
    }
  }

  async init(sub) {
    if (!(this.db instanceof DbMongo)) {
      this.db = await new DbMongo(this.db);
      this.db[this.$.instance].detached = true;
    }

    if (!this.capDb) this.capDb = this.db;

    if (!(this.capDb instanceof DbMongo)) {
      this.capDb = await new DbMongo(this.capDb);
      this.capDb[this.$.instance].detached = true;
    }

    await sub({mqModel: MqMongoModel.sub({db: this.db})});
    this.Model = this.model = this.mqModel.model;

    this.subs = {};
    this.subWait = {};
    this.workers = {};
    this.workerIdNext = 1;
    this.freeWorkers = {};

    this.waitTerminate = new Promise((resolve) => {
      this.terminate = resolve;
    });

    this.workerProlongVisibilityBound = this.workerProlongVisibility.bind(this);
    await this.sub(this.queueEventName, this.takeFreeWorker);

    this.waitPubsubReady = new Promise((resolve) => {
      this.pubsubReady = resolve;
    });

    this.waitPubsubCollReady = new Promise((resolve) => {
      this.pubsubCollReady = resolve;
    });

    this.pubsubLoop().catch((err) => {
      this.$.throw(err, `MQ PubSub Loop Fatal (code=${err.code || 'none'})`);
    });

    await this.waitPubsubReady;
  }

  async final(reason) {
    if (this.finishing) return;
    this.finishing = true;
    this.terminate();
    this.terminate = null;
    this.waitTerminate = null;
    this.pubsubCollReady = null;
    this.waitPubsubCollReady = null;

    await Object.keys(this.workers).map(workerId => this.unhandle(workerId));

    for (const event in this.subWait) {
      const wait = this.subWait[event];
      if (wait) wait.resolve();
      this.subWait[event] = null;
    }

    this.workerProlongVisibilityBound = null;

    //if (this.db[this.$.instance].detached)
    await this.$.finish(this.db, reason);
    //if (this.capDb[this.$.instance].detached)
    await this.$.finish(this.capDb, reason);
  }
}

MqMongo.pubsubRetryMsec = 2000;

MqMongo.visibilityMsec = 180000;
MqMongo.pubsubCapSize = 1024 * 1024 * 5;
MqMongo.tailableRetryInterval = 2000;

MqMongo.accuracyMsec = MqMongo.visibilityMsec / 3;
MqMongo.prolongMsec = MqMongo.accuracyMsec;

module.exports = MqMongo;
