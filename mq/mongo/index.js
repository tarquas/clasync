const Clasync = require('../..');
const DbMongo = require('../../db/mongo');
const DbMongoModel = require('../../db/mongo/model');
const util = require('util');
const mongodb = require('mongodb');

const MongoClient = mongodb.MongoClient;

class MqMongoModel extends DbMongoModel {
  get schema() {
    return new this.Schema({
      _id: String,
      date: this.Schema.Types.Mixed,
      curDate: this.Schema.Types.Mixed,
      expires: {type: Date, expires: 1},
      queue: String,
      message: this.Schema.Types.Mixed,
      priority: Number,
      topic: String,
      nRequeues: Number
    }, {
      collection: this.mq.queueName
    })
      .index({queue: 1, priority: 1, date: 1})
      .index({date: 1});
  }
}

class MqMongo extends Clasync {
  // db - config to create DbMongo instance to use for queues
  // capDb - config to create DbMongo instance to use for events

  static get type() { return 'mq'; }

  get pubsubName() { return 'pubsub'; }
  get queueName() { return 'pubsubQueue'; }
  get queueEventName() { return 'queue:newTask'; }

  async pub(event, payload) {
    if (this.finishing) return null;
    if (this.waitPubsubReady) await this.waitPubsubReady;

    const inserted = await util.promisify(this.pubsubColl.insertOne).call(
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

    const id = this.dbMongo.newShortId();

    const item = await this.model.findOneAndUpdate({date: true}, {
      $currentDate: {date: true, curDate: true}, $set: {
        _id: id,
        queue,
        message: payload,
        priority: +opts.priority || 0,
        topic: (opts.topic || '').toString(),
        nRequeues: 0
      }
    }, {upsert: true, new: true}).lean().exec();

    if (opts.temp) {
      await this.model.update({_id: id}, {$set: {
        expires: new Date(+item.curDate + this.$.visibilityMsec)
      }}).lean().exec();
    }

    await this.signalQueue(queue);
    return item;
  }

  async remove(id) {
    const removed = await this.model.deleteOne({_id: id}).exec();
    return removed;
  }

  async requeue(id, err) {
    const upd = {$currentDate: {date: true}};
    if (err) upd.$inc = {nRequeues: 1};

    const item = await this.model.findOneAndUpdate(
      {_id: id},
      upd,
      {select: {queue: 1}}
    ).lean().exec();

    await this.signalQueue(item.queue);
    return item;
  }

  async extend(id, nowDate) {
    const now = +(nowDate || new Date());

    await this.model.update(
      {_id: id},
      {$set: {expires: new Date(now + this.$.visibilityMsec)}}
    ).exec();
  }

  async hide(id, nowDate) {
    const now = +(nowDate || new Date());

    await this.model.update(
      {_id: id},
      {$set: {date: new Date(now + this.$.visibilityMsec)}}
    ).exec();
  }

  async workerProlongVisibility(object) {
    if (object.halt) return;

    if (object.id) {
      await this.hide(object.id, +new Date() + object.sync);
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

  async getNow() {
    const start = process.uptime();

    const item = await util.promisify(this.pubsubColl.findOneAndUpdate).call(
      this.pubsubColl,
      {_id: this.$.nullObjectId},
      {$currentDate: {curDate: true}},
      {upsert: true, returnOriginal: false}
    );

    const diff = process.uptime() - start;

    if (diff >= this.$.lagLatencySec) {
      throw new Error('MQ PubSub Sync: network latency is too big');
    }

    const curDate = this.$.get(item, 'value', 'curDate');
    return curDate;
  }

  worker(queue, onData) {
    const workerId = this.workerIdNext++;

    const object = {
      sync: null,
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
        object.sync = (await this.getNow()) - new Date();
        object.queue = queue;

        while (!object.halt) { // eslint-disable-line
          if (!object.resume) {
            object.wait = new Promise((resume) => {
              object.resume = resume;
            });
          }

          const now = +new Date() + object.sync;
          const start = process.uptime();

          const currentTopics = (await this.model.distinct('topic', {
            queue,
            date: {$gte: new Date(now + this.$.accuracyMsec)}
          })).filter(this.$.echo);

          const item = await this.model.findOneAndUpdate(
            {
              queue,
              date: {$lt: new Date(now + this.$.accuracyMsec)},
              topic: {$nin: currentTopics}
            },

            {
              $currentDate: {curDate: true},
              $set: {date: new Date(now + this.$.visibilityMsec)}
            },

            {sort: {queue: 1, priority: 1, date: 1}, new: true}
          ).lean().exec();

          const diff = process.uptime() - start;

          if (!item) {
            const curDate = await this.getNow();
            if (diff < this.$.lagLatencySec) object.sync = curDate - new Date();

            this.setFreeWorker(workerId);

            await this.$.race([object.wait, this.$.delay(this.$.visibilityMsec)]);

            object.resume = null;
            object.wait = null;
            continue;
          }

          if (diff < this.$.lagLatencySec) object.sync = item.curDate - new Date();

          if (item.topic) {
            const topicRace = await this.model.find({
              queue,
              date: {$gte: new Date(now + this.$.accuracyMsec)},
              topic: item.topic
            }, {_id: 1}).lean().exec();

            if (topicRace.length && item._id !== topicRace[0]._id) {
              await this.requeue(item._id);
              continue;
            }
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
              const result = await onData.call(this, decoded);

              if (this[this.$.instance].final) return null;

              if (result !== false) {
                await this.remove(object.id);
              } else {
                await this.requeue(object.id);
              }
            } catch (err) {
              if (this[this.$.instance].final) return null;

              if ((item.nRequeues | 0) < this.$.maxRequeuesOnError) {
                await this.requeue(object.id, true);
              }

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
    const rpcId = this.dbMongo.newShortId();

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
        const db = this.capDbMongo.db();
        let coll = this.pubsubColl;

        if (!coll) {
          coll = await util.promisify(db.createCollection).call(
            db,
            this.pubsubName,

            {
              capped: true,
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
          const docs = await util.promisify(coll.insertOne).call(coll, {
            _id: this.$.nullObjectId,
            dummy: true,
            curDate: new Date()
          }, {safe: true});

          [this.latest] = docs.ops;
        }

        if (this.pubsubReady) {
          this.pubsubReady();
          this.pubsubReady = null;
          this.waitPubsubReady = null;
        }

        if (this.finishing || this.capDbMongo._closeCalled) return;

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
        if (this.$.get(this.capDbMongo, '_closeCalled')) return;

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
    this.dbMongo = await new DbMongo(this.db);
    this.dbMongo[this.$.instance].detached = true;

    this.capDbMongo = await util.promisify(MongoClient.connect).call(
      MongoClient,
      this.capDb ? this.capDb.connString : this.db.connString,
      {...DbMongo.hardOptions, forceServerObjectId: true}
    );

    await sub({mqModel: MqMongoModel.sub({db: this.dbMongo})});
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
    for (const [workerId, object] of Object.entries(this.workers)) {
      await this.unhandle(workerId);
      if (!object || !object.id) continue;
      await this.requeue(object.id);
    }

    if (this.finishing) return;
    this.finishing = true;
    this.terminate();
    this.terminate = null;
    this.waitTerminate = null;
    this.pubsubCollReady = null;
    this.waitPubsubCollReady = null;

    for (const event in this.subWait) {
      const wait = this.subWait[event];
      if (wait) wait.resolve();
      this.subWait[event] = null;
    }

    this.workerProlongVisibilityBound = null;

    await this.$.finish(this.dbMongo, reason);
    this.capDbMongo.close();
  }
}

MqMongo.nullObjectId = DbMongo.ObjectId('000000000000000000000000');

MqMongo.pubsubRetryMsec = 2000;

MqMongo.visibilityMsec = 60000;
MqMongo.pubsubCapSize = 1024 * 1024 * 5;
MqMongo.tailableRetryInterval = 2000;

MqMongo.accuracyMsec = MqMongo.visibilityMsec / 3;
MqMongo.prolongMsec = MqMongo.accuracyMsec;
MqMongo.nowSyncMsec = MqMongo.accuracyMsec / 2;
MqMongo.lagLatencySec = MqMongo.nowSyncMsec / 4000;
MqMongo.maxRequeuesOnError = 3;

module.exports = MqMongo;
