let threads;

try {
  threads = require('worker_threads');
} catch (err) {
  throw 'worker_threads module is not supported. please use Node > 11.10 to start this app';
}

const {parentPort, isMainThread} = threads;

if (isMainThread) throw 'Referencing Thread class from main thread is not allowed';

const ClasyncEmitter = require('../emitter');

class Thread extends ClasyncEmitter {
  async init() {
    if (this.$.threadInst) throw new Error('Only 1 instance of Thread class is allowed per worker');
    this.$.threadInst = this;
    parentPort.on('message', this.message.bind(this));
  }

  async afterInit() {
    parentPort.postMessage({event: 'ready'});
  }

  static async initFatal(err) {
    parentPort.postMessage({event: 'error', error: {stack: err.stack}});
    throw err;
  }

  async final() {
  }

  async message(msg) {
    if (!msg) return;

    switch (msg.event) {
      case 'finish': this.$.exit(); break;

      case 'rpc': {
        const {id, method, data} = msg;

        try {
          if (!this[this.$.instance].inited) throw 'notReady';
          const result = await this.emit(method, ...data);
          parentPort.postMessage({event: `rpc_${id}`, result});
        } catch (error) {
          parentPort.postMessage({event: `rpc_${id}`, error: error.stack ? {stack: error.stack} : error});
        }
      }; break;
    }
  }

  static log(...args) {
    parentPort.postMessage({event: 'log', type: 'log', args});
  }

  static logError(...args) {
    parentPort.postMessage({event: 'log', type: 'logError', args});
  }

  static logFatal(...args) {
    parentPort.postMessage({event: 'log', type: 'logFatal', args});
  }

  static logDebug(...args) {
    parentPort.postMessage({event: 'log', type: 'logDebug', args});
  }
}

Thread.threadInst = null;

module.exports = Thread;
