const cluster = require('cluster');
const ClasyncEmitter = require('../emitter');

class WorkerPool extends ClasyncEmitter {
  // filename, min, max, opt, timeout, timeoutErr

  async init() {
    this.nextWorkerId = 0;
    this.workers = this.$.makeObject();
    this.freeWorkers = this.$.makeObject();

    this.min |= 0;
    this.max |= 0;
    this.opt |= 0;

    if (!this.opt) this.opt = this.max;
    else if (this.opt < this.min) this.opt = this.min;

    this.nWorkers = this.nFreeWorkers = 0;

    for (let i = 0; i < this.min; i++) {
      this.addWorker();
    }

    await this.$.all(
      Object.values(this.workers)
      .map(worker => this.$.waitWorkerEvent.call(this, worker, 'ready'))
    );
  }

  async final() {
    const planEvents = this.$.all(
      Object.values(this.workers)
      .map(worker => this.$.waitEvent(worker, 'exit', 'error'))
    );

    for (const id of Object.keys(this.workers)) {
      this.removeWorker(id);
    }

    await planEvents;
  }

  addWorker() {
    if (this.max && this.nWorkers >= this.max) throw 'noFreeWorkers';
    cluster.setupMaster({exec: this.filename});
    const worker = cluster.fork(process.env);
    const id = ++this.nextWorkerId;
    worker.on('exit', this.workerExit.bind(this, id));
    worker.on('message', this.workerMessage.bind(this, id));
    this.workers[id] = worker;
    this.freeWorkers[id] = worker;
    this.nWorkers++;
    this.nFreeWorkers++;
    return id;
  }

  workerExit(id) {
    this.removeWorker(id, true);
  }

  workerMessage(id, {event, type, args}) {
    if (event !== 'log') return;

    switch (type) {
      case 'log': this.$.log(...args); break;
      case 'logError': this.$.logError(...args); break;
      case 'logFatal': this.$.logFatal(...args); break;
      case 'logDebug': this.$.logDebug(...args); break;
    }
  }

  removeWorker(id, exited) {
    if (this.freeWorkers[id]) {
      delete this.freeWorkers[id];
      this.nFreeWorkers--;
    }

    const worker = this.workers[id];

    if (worker) {
      if (!exited) worker.send({event: 'finish'});
      delete this.workers[id];
      this.nWorkers--;
      //worker.kill();
      return true;
    }

    return false;
  }

  async rpc(method, ...data) {
    let [id, worker] = this.$.firstEntry(this.freeWorkers);

    if (!worker) {
      id = this.addWorker();
      worker = this.workers[id];
      await this.$.waitWorkerEvent.call(this, worker, 'ready');
    }

    delete this.freeWorkers[id];
    this.nFreeWorkers--;

    try {
      const result = await this.$.workerRpc.call(this,
        worker,
        method,
        data,
        this.timeout,
        this.timeoutErr
      );

      return result;
    } finally {
      if (this.opt && this.nFreeWorkers > this.opt) {
        const planEvent = this.$.waitEvent(worker, 'exit', 'error');
        this.removeWorker(id);
        await planEvent;
      } else if (this.workers[id]) {
        this.freeWorkers[id] = worker;
        this.nFreeWorkers++;
      }
    }
  }

  static async waitWorkerEvent(worker, dataEvent, timeout, timeoutErr, post) {
    let got;

    try {
      let planEvent = this.$.waitEvent(worker, 'message,exit', 'error');

      if (post) worker.send(post);

      do {
        const {event, data} = await this.$.race([
          planEvent,
          this.$.timeout(timeout || this.$.waitTimeout, timeoutErr)
        ]);

        if (event === 'exit') throw `Worker in ${this.name || this.$.name} exited unexpectedly`;
        if (data.event === 'error') throw data;
        if (data.event === dataEvent) return data;

        planEvent = this.$.waitEvent(worker, 'message,exit', 'error');
      } while (true);
    } catch (err) {
      if (err.event === 'error') throw err.data;
      throw err;
    }
  }

  static async workerRpc(worker, method, data, timeout, timeoutErr) {
    const id = ++this.$.lastRpcId;
    const post = {event: 'rpc', id, method, data};

    const {result, error} = await this.$.waitWorkerEvent.call(this,
      worker,
      `rpc_${id}`,
      timeout,
      timeoutErr,
      post
    );

    if (error) throw error;
    return result;
  }
}

WorkerPool.waitTimeout = 5000;
WorkerPool.lastRpcId = 0;

module.exports = WorkerPool;
