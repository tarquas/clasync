const Clasync = require('../..');
const DbMongo = require('../../db/mongo');
const DbMongoModel = require('../../db/mongo/model');
const util = require('util');
const mongodb = require('mongodb');
const redis = require('redis');

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
      important: Boolean,
      nRequeues: Number,
      nTriesLeft: Number,
      failQueue: String,
      failReason: String,
    }, {
      collection: this.mq.queueName
    })
      .index({queue: 1, priority: 1, date: 1})
      .index({queue: 1, curDate: 1})
      .index({date: 1})
      .index({queue: 1, topic: 1});
  }
}

class MqMongo extends Clasync.Emitter {
  // db - config to create DbMongo instance to use for queues
  // capDb - config to create DbMongo instance to use for events
  // redis - alternatively use redis for pubsub
  prefix = ''; // if specified, will serve the specific common prefix for `Mq.Disp`

  static get type() { return 'mq'; }

  get pubsubName() { return 'pubsub'; }
  get queueName() { return 'pubsubQueue'; }
  get queuePfx() { return 'queue:'; }
  get newTaskEvent() { return 'newTask'; }
  get sleepEvent() { return 'sleep'; }
  get discardEvent() { return 'discard'; }

  async pub(event, payload) {
    if (this.finishing) return null;

    if (this.redisPub) {
      const json = JSON.stringify(payload);
      await new Promise(ok => this.redisPub.publish(event, json, ok));
      return {event, message: payload};
    }

    if (this.waitPubsubReady) await this.waitPubsubReady;

    const inserted = await util.promisify(this.pubsubColl.insertOne).call(
      this.pubsubColl,
      {event, message: payload},
      {safe: true}
    );

    return inserted;
  }

  async sub(event, onData) {
    if (this.finishing) return null;
    const workerId = this.workerIdNext++;
    const object = {sub: event};

    let subHandlers = this.subs[event];

    if (!subHandlers) {
      if (this.redisSub) {
        await new Promise(ok => this.redisSub.subscribe(event, ok));
      }

      this.subs[event] = subHandlers = this.$.makeObject();
    }

    subHandlers[workerId] = onData;

    this.workers[workerId] = object;
    return workerId;
  }

  async signalQueue(args) {
    const {queue} = args;
    this.pub(`${queue}:${this.queuePfx}${this.newTaskEvent}`, args);
    const inserted = await this.pub(`${this.queuePfx}${this.newTaskEvent}`, args);
    return inserted;
  }

  async push(queue, payload, opts = {}) {
    if (this.finishing) return null;
    if (this.waitPubsubReady) await this.waitPubsubReady;

    const id = this.dbMongo.newShortId();
    const $currentDate = {curDate: {$type: 'timestamp'}};

    let $set = {
      _id: id,
      queue,
      message: payload,
      priority: +opts.priority || 0,
      topic: (opts.topic || '').toString(),
      important: !!opts.important,
      nRequeues: 0,
      nTriesLeft: opts.maxTries || this.maxTries || this.$.maxTries || -1,
      failQueue: opts.failQueue || this.failQueue || this.$.failQueue || ''
    };

    if (opts.expires) $set.expires = new Date(opts.expires);

    if (opts.at) {
      $set.date = new Date(opts.at);
    } else if (opts.in) {
      $set.date = new Date(+await this.syncTime() + (parseInt(opts.in) || 0));
    } else {
      $currentDate.date = true;
    }

    const item = await this.model.findOneAndUpdate(
      {date: true},
      {$currentDate, $set},
      {upsert: true, new: true, select: {
        queue: 1, date: 1, nRequeues: 1, nTriesLeft: 1
      }}
    ).lean().exec();

    const ttl = parseInt(opts.ttl) || (opts.temp && this.visibilityMsec);

    if (ttl) {
      $set = {expires: new Date(+item.date + ttl)};
      await this.model.updateOne({_id: id}, {$set}).exec();
    }

    item.expires = $set.expires;

    await this.signalQueue({
      queue,
      event: 'push',
      id,
      at: item.date,
      expires: item.expires,
      nTriesLeft: item.nTriesLeft
    });

    return item;
  }

  async remove(id) {
    const removed = await this.model.deleteOne({_id: id}).exec();
    return removed;
  }

  async requeue(id, err, date, reason) {
    const upd = {$currentDate: {curDate: {$type: 'timestamp'}}};

    if (date) {
      upd.$set = {date};
    } else {
      upd.$currentDate.date = true;
    }

    if (err) upd.$inc = {nRequeues: 1};
    else upd.$inc = {nTriesLeft: 1};

    if (reason) this.$.set(upd, '$set', 'failReason', reason);

    const item = await this.model.findOneAndUpdate(
      {_id: id},
      upd,
      {
        select: {
          queue: 1, date: 1, expires: 1, nRequeues: 1, nTriesLeft: 1
        },
        new: true
      }
    ).lean().exec();

    if (item) await this.signalQueue({
      queue: item.queue,
      event: 'requeue',
      id,
      at: item.date,
      expires: item.expires,
      errors: item.nRequeues,
      nTriesLeft: item.nTriesLeft
    });

    return item;
  }

  async extend(id, nowDate) {
    const now = +(nowDate || new Date());

    await this.model.updateOne(
      {_id: id},
      {$set: {expires: new Date(now + this.visibilityMsec)}}
    ).exec();
  }

  async hide(id, nowDate) {
    const now = +(nowDate || new Date());

    await this.model.updateOne(
      {_id: id},
      {$set: {date: new Date(now + this.visibilityMsec)}}
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
      this.prolongMsec,
      object
    );
  }

  takeFreeWorker({queue}) {
    const free = this.freeWorkers[queue];
    if (!free) return false;

    for (const workerId in free) {
      const worker = this.workers[+workerId];
      delete free[workerId];
      if (!worker) continue;

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
    if (!free) this.freeWorkers[queue] = free = this.$.makeObject();
    free[`+${workerId}`] = true;
    return true;
  }

  async syncTime() {
    const curDate = await this.$.callOnce(this.syncTimeBound);
    return curDate;
  }

  async syncTimeFunc() {
    let retries = this.$.maxSyncRetries;

    while (true) {
      const start = process.uptime();

      const item = await this.model.findOneAndUpdate(
        {_id: this.$.nullObjectId},
        {$currentDate: {curDate: true}, $setOnInsert: {_id: this.$.nullObjectId}},
        {upsert: true, new: true}
      ).lean().exec();

      const diff = process.uptime() - start;

      if (diff >= this.lagLatencySec) {
        await this.$.delay(this.$.pubsubRetryMsec); // wait before next check to avoid flood
        if (--retries) continue;
        throw new Error('MQ PubSub Sync: network latency is too big. Worker disabled');
      }

      const curDate = item.curDate;
      return curDate;
    }
  }

  worker(queue, onData, opts = {}) {
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
        object.sync = (await this.syncTime()) - new Date();
        object.queue = queue;

        while (!object.halt) { // eslint-disable-line
          if (!object.resume) {
            object.wait = new Promise((resume) => {
              object.resume = resume;
            });
          }

          const now = +new Date() + object.sync;
          const start = process.uptime();

          const itemQuery = {
            queue,
            date: {$lt: new Date(now + this.accuracyMsec)}
          };

          if (opts.topic) {
            const currentTopics = (await this.model.distinct('topic', {
              queue,
              date: {$gte: new Date(now + this.accuracyMsec)}
            })).filter(this.$.echo);

            itemQuery.topic = {$nin: currentTopics};
          }

          const item = await this.model.findOneAndUpdate(
            itemQuery,

            {
              $currentDate: {curDate: true},
              $set: {date: new Date(now + this.visibilityMsec)},
              $inc: {nTriesLeft: -1}
            },

            {sort: {queue: 1, priority: 1, date: 1}, new: true}
          ).lean().exec();

          const diff = process.uptime() - start;

          if (!item) {
            let curDate = new Date(+new Date() + object.sync);

            this.setFreeWorker(workerId);

            let delay = this.visibilityMsec;

            const nextItems = await this.model.find({
              queue,
              date: {$gt: curDate}
            }).sort({queue: 1, priority: 1, date: 1}).limit(1).lean().exec();

            if (nextItems.length) {
              const next = nextItems[0];
              const nextDelay = next.date - curDate;
              if (nextDelay < delay) delay = nextDelay;
            }

            const obj = {queue, delay};
            this.pub(`${queue}:${this.queuePfx}${this.sleepEvent}`, obj);
            this.pub(`${this.queuePfx}${this.sleepEvent}`, obj);
            this.pub(`${this.queuePfx}${this.sleepEvent}:${queue}`, obj); //TODO: deprecate

            await this.$.race([object.wait, this.$.delay(delay)]);

            object.resume = null;
            object.wait = null;
            continue;
          }

          if (diff < this.lagLatencySec) object.sync = item.curDate - new Date();

          if (item.expires < now) {
            const obj = {queue, event: 'expired', id: item._id};
            this.pub(`${this.queuePfx}${this.discardEvent}`, obj);
            this.pub(`${queue}:${this.queuePfx}${this.discardEvent}`, obj);
            await this.model.deleteOne({_id: item._id});
            continue;
          }

          if (item.nTriesLeft === -1) {
            if (item.failQueue) {
              await this.model.updateOne(
                {_id: item._id},

                {$set: {
                  queue: item.failQueue,
                  date: item.curDate,
                  failQueue: queue
                }}
              );

              await this.signalQueue({
                queue: item.failQueue,
                event: 'failTries',
                failedQueue: queue,
                id: item._id,
                at: item.date,
                expires: item.expires,
                nTriesLeft: item.nTriesLeft
              });
            } else {
              const obj = {queue, event: 'failTries', id: item._id, at: item.date};
              this.pub(`${this.queuePfx}${this.discardEvent}`, obj);
              this.pub(`${queue}:${this.queuePfx}${this.discardEvent}:${queue}`, obj);
              await this.model.deleteOne({_id: item._id});
            }

            continue;
          }

          if (opts.topic && item.topic) {
            const raceProj = {_id: 1};
            if (this.debugRace) raceProj.message = 1;

            const raceQuery = this.model.find({
              queue,
              date: {$gte: new Date(now + this.accuracyMsec)},
              topic: item.topic
            }, raceProj).sort({queue: 1, curDate: 1})

            if (!this.debugRace) raceQuery.limit(2);

            const topicRace = await raceQuery.lean().exec();

            if (topicRace.length > 1) {
              let first = topicRace[0];

              if (this.debugRace) {
                this.$.logDebug([this.debugRace],
                  `MQ RACE Conflict: [#${workerId}] ` +
                  `${item.message} ` +
                  `F:${first.message} ` +
                  `ALL: ${topicRace.map(t => t.message).join(',')}`
                );
              }

              if (first._id !== item._id) {
                if (this.debugRace) this.$.logDebug([this.debugRace], `MQ RACE Requeue: ${item.message}`);
                await this.requeue(item._id, false, item.curDate, 'MQ RACE Requeue');
                continue;
              }
            }
          }

          object.id = item._id;

          if (object.halt) {
            await this.requeue(object.id);
            return;
          }

          object.prolong = setTimeout(
            this.workerProlongVisibilityBound,
            this.prolongMsec,
            object
          );

          try {
            const decoded = item.message;

            if (item.important || opts.important) {
              object.waitImportant = new Promise((resolve) => { object.resolveImportant = resolve; });
            }

            try {
              const result = await onData.call(this, decoded, item);

              if (!item.important && this[this.$.instance].final) return null;

              if (result !== false) {
                await this.remove(object.id);
              } else {
                await this.requeue(object.id);
              }
            } catch (err) {
              if (this[this.$.instance].final) return null;

              if (!(await this.error(err, {
                id: queue,
                msg: item.message,
                type: 'WORKER'
              }))) {
                await this.requeue(
                  object.id,
                  true,
                  new Date(+item.curDate + this.$.requeueOnErrorMsec),
                  err && (err.stack || err.message || err).toString()
                );
              }
            }

            if (item.important) {
              object.resolveImportant();
              object.waitImportant = null;
              object.resolveImportant = null;
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
      this.error(err, {id: '<fatal>', msg: '', type: 'WORKER'});
    });

    return workerId;
  }

  async rpc(queue, payload, opts) {
    if (this.finishing) return undefined;
    const rpcId = this.dbMongo.newShortId();

    let response;
    const waitResponse = new Promise((resolve) => { response = resolve; });
    let timer;

    const waitTimer = new Promise((resolve) => {
      timer = setTimeout(resolve, this.visibilityMsec);
    });

    const workerId = this.sub(rpcId, response);
    await this.push(queue, {rpcId, args: payload}, {temp: true, ...opts});

    const msg = await this.$.race([
      waitResponse,
      waitTimer,
      this.waitTerminate
    ]);

    clearTimeout(timer);
    this.unhandle(workerId);
    return msg;
  }

  rpcworker(queue, onData, opts = {}) {
    const workerId = this.worker(queue, async (msg) => {
      const result = await onData.call(this, msg.args);
      await this.pub(msg.rpcId, result);
    }, opts);

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

          if (this.redisSub) {
            await new Promise(ok => this.redisSub.unsubscribe(object.sub, ok));
          }

          object.sub = null;
        }
      }
    }
  }

  async error(err, {id, type}) {
    if (!this.errorSilent) this.$.throw(err, `MQ ${type.toUpperCase()} ${id}`);
    return false;
  }

  async info(queue) {
    const count = await this.model.find({queue}).countDocuments().exec();
    const result = {messageCount: count};
    return result;
  }

  async deleteIfSafe() {
    // STUB: if safe it's like autodeleted by arch
  }

  async dispatchMessage(event, message) {
    const subHandlers = this.subs[event];

    if (subHandlers) {
      for (const workerId in subHandlers) {
        const worker = this.workers[workerId];
        if (!worker) continue;

        try {
          let wait = this.subWait[event];
          if (wait) await wait.promise;
          if (this.finishing) return delete this.subWait[event];
          const subh = subHandlers[workerId];
          let process = subh && subh.call(this, message);

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
  }

  redisMessage(event, message) {
    this.dispatchMessage(event, JSON.parse(message))
    .catch((err) => {
      this.$.throw(err, 'MQ Redis PubSub Handler Fail');
    });
  }

  async pubsubLoop() { // eslint-disable-line
    let prevErr = null;

    while (!this.finishing) {
      try {
        const db = this.capDbMongo.db();
        let coll = this.pubsubColl;

        if (!coll) {
          try {
            coll = await util.promisify(db.collection).call(db, this.pubsubName, {strict: true});
          } catch (err) { }

          if (!coll) coll = await util.promisify(db.createCollection).call(
            db,
            this.pubsubName,

            {
              capped: true,
              size: this.$.pubsubCapSize,
              //strict: false
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

            this.dispatchMessage(event, message)
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
    if (!this.debugRace) this.debugRace = this.$.getDebug('clasync.mq clasync.mq.race');

    if (!this.visibilityMsec) this.visibilityMsec = this.$.visibilityMsec;
    this.accuracyMsec = this.visibilityMsec / this.$.accuracyFraction;
    this.nowSyncMsec = this.accuracyMsec / 2;
    this.prolongMsec = this.accuracyMsec / this.$.prolongFraction;
    this.lagLatencySec = this.nowSyncMsec / this.$.lagLatencyFraction / 1000;
    this.dbMongo = await new DbMongo(this.db)[Clasync.ready];
    this.dbMongo[this.$.instance].detached = true;

    if (this.redis) {
      this.redisPub = redis.createClient(this.redis.connString);
      this.redisSub = redis.createClient(this.redis.connString);
    } else {
      this.capDbMongo = await util.promisify(MongoClient.connect).call(
        MongoClient,
        this.capDb ? this.capDb.connString : this.db.connString,

        {
          ...DbMongo.hardOptions,
          forceServerObjectId: true
        }
      );
    }

    await sub({mqModel: MqMongoModel.sub({db: this.dbMongo})});
    this.Model = this.model = this.mqModel.model;

    this.subs = this.$.makeObject();
    this.subWait = this.$.makeObject();
    this.workers = this.$.makeObject();
    this.workerIdNext = 1;
    this.freeWorkers = this.$.makeObject();

    this.waitTerminate = new Promise((resolve) => {
      this.terminate = resolve;
    });

    this.syncTimeBound = this.syncTimeFunc.bind(this);

    this.workerProlongVisibilityBound = this.workerProlongVisibility.bind(this);
    await this.sub(this.queuePfx + this.newTaskEvent, this.takeFreeWorker);

    if (this.redisSub) {
      this.redisMessageBound = this.redisMessage.bind(this);
      this.redisSub.on('message', this.redisMessageBound);
    } else {
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
  }

  async final(reason) {
    await this.$.all(Object.entries(this.workers).map(async ([workerId, object]) => {
      await this.unhandle(workerId);
      if (!object || !object.id) return;

      if (object.waitImportant) {
        await object.waitImportant;
        await this.signalQueue({queue: object.queue, event: 'final'});
      } else {
        await this.requeue(object.id);
      }
    }));

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

    if (this.redisSub) {
      this.redisSub.removeListener('message', this.redisMessageBound);
      this.redisPub.quit();
      this.redisSub.quit();
    } else {
      this.capDbMongo.close();
    }
  }
}

MqMongo.nullObjectId = DbMongo.ObjectId('000000000000000000000000');

MqMongo.pubsubRetryMsec = 2000;

MqMongo.visibilityMsec = 60000;
MqMongo.pubsubCapSize = 1024 * 1024 * 5;
MqMongo.tailableRetryInterval = 2000;

MqMongo.requeueOnErrorMsec = 21000;
MqMongo.maxTries = 3;
MqMongo.failQueue = 'unhandledExceptions';
MqMongo.maxSyncRetries = 3;

MqMongo.accuracyFraction = 3;
MqMongo.prolongFraction = 1;
MqMongo.lagLatencyFraction = 2;

module.exports = MqMongo;
