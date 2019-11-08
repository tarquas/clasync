const cluster = require('cluster');
const {isMaster} = cluster;

const ClasyncEmitter = require('../emitter');

class Worker extends ClasyncEmitter {
  static get Pool() { return require('./pool'); }

  static get type() { return 'worker'; }

  async init() {
    if (isMaster) throw new Error('Referencing Worker class from master process is not allowed');
    if (this.$.workerInst) throw new Error('Only 1 instance of Worker class is allowed per worker');
    this.$.workerInst = this;
    process.on('message', this.message.bind(this));
  }

  async afterInit() {
    process.send({event: 'ready'});
  }

  static async mainFatal(err) {
    process.send({event: 'error', error: {stack: err.stack}});
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
          process.send({event: `rpc_${id}`, result});
        } catch (error) {
          process.send({event: `rpc_${id}`, error: error.stack ? {stack: error.stack} : error});
        }
      }; break;
    }
  }

  async rpc(method, ...data) {
    const id = ++this.$.lastRpcId;
    const post = {event: 'rpc', id, method, data};

    const {result, error} = await this.$.Pool.waitWorkerEvent.call(this.$,
      process,
      `rpc_${id}`,
      this.timeout,
      this.timeoutErr,
      post
    );

    if (error) throw error;
    return result;
  }

  static log(...args) {
    process.send({event: 'log', type: 'log', args});
  }

  static logError(...args) {
    process.send({event: 'log', type: 'logError', args});
  }

  static logFatal(...args) {
    process.send({event: 'log', type: 'logFatal', args});
  }

  static logDebug(...args) {
    process.send({event: 'log', type: 'logDebug', args});
  }

  static async configure() { return {}; }
}

Worker.workerInst = null;
Worker.waitTimeout = 5000;
Worker.lastRpcId = 0;

module.exports = Worker;
