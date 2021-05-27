const $ = require('../../db/mongo');
const MqDisp = require('../disp');
const os = require('os');
const util = require('util');

class Discovery extends MqDisp {
  static get Master() { return require('./master'); }

  prefix = 'discovery_';  // MQ prefix to use for PubSub
  info = {};  // what information to share with other instances at the same MQ bus
  db = null;  // optional `Db.Mongo` instance. if specified, `.info` also will include DB `dataSize`
  trackCpu = false;  // if true, will include CPU load in `.info`: `.cpuAvg`, `.prevCpuAvg`, `.cpuAvgLoad`

  // Events:
  async onUp(p) { return await this.emit('up', p); }  // {instId, info, newInfo}
  async onDown(p) { return await this.emit('down', p); }  // {instId, info}

  // `.info` additional built-in values:
  //   `.srcCreatedAt`, `.createdAt` -- when instance went alive and joined the bus
  //   `.srcUpdatedAt`, `.updatedAt` -- when instance `.info` was last updated

  // for `...At` dates:
  //   `src...` prefix means local time of instance, which info is observed;
  //    no `src...` prefix means local time of observer instance

  // broadcast `.info` update
  async update$(info) {
    info.srcUpdatedAt = new Date();
    await this.pub('instanceUp', {instId: this.instId, info});
  }

  instanceUpdate({instId, info}) {
    if (!this.instances) return;
    const up = this.instances[instId];
    if (!up) return;

    const p = up.cpuAvg;
    Object.assign(up, info);
    up.updatedAt = new Date();
    if (!up.createdAt) up.createdAt = up.updatedAt;

    if (this.trackCpu) {
      const c = up.cpuAvg;
      up.prevCpuAvg = p;

      if (c && p) {
        const idle = c.idle - p.idle;
        const total = c.total - p.total;
        if (total) up.cpuAvgLoad = 100 - ((100 * idle) / total | 0);
      }
    }

    return up;
  }

  instanceDown({instId}) {
    if (!this.instances) return;
    const info = this.instances[instId];
    if (!info) return;
    delete this.instances[instId];
    this.nInstances--;
  }

  async keepAlive$(info = {}) {
    if (!this.instances) return;
    if (this.trackCpu) info.cpuAvg = this.$.cpuAverage();

    if (this.db) {
      const db = this.$.get(this.db.conn, 'db');
      const stats = db && (await util.promisify(db.stats).call(db));
      if (stats) info.dbDataSize = stats.dataSize;
    }

    try {
      await this.update$(info);
      if (this.instances) setTimeout(this.keepAlive, this.$.msecPingAlive);
    } catch (err) {
      if (this.instances) setTimeout(this.keepAlive, this.$.msecPingRetry, info);
    }
  }

  async ['SUB instanceUp']({instId, info}) {
    if (!this.instances) return;

    if (!this.instances[instId]) {
      this.instances[instId] = {};
      this.nInstances++;
    }

    const allInfo = this.instanceUpdate({instId, info});
    if (allInfo) await this.onUp({instId, info: allInfo, newInfo: info});
  }

  async ['SUB instanceDown']({instId}) {
    if (!this.instances) return;
    const info = this.instances[instId];
    const args = {instId, info, reason: 'managedShutdown'};
    this.instanceDown(args);
    if (info) await this.onDown(args);
  }

  *listIter() {
    const now = +new Date();
    const insts = this.instances;
    if (!insts) return;

    for (const instId in insts) {
      if (Object.hasOwnProperty.call(insts, instId)) {
        const info = insts[instId];

        if (now - info.updatedAt > this.$.msecAliveExpires) {
          const args = {instId, info, reason: 'pingTimeout'};
          this.instanceDown(args);
          this.emit('down', args);
        } else {
          yield [instId, info];
        }
      }
    }
  }

  checkExpires() {
    if (!this.instances) return false;
    for (const inst of this.listIter());
    return true;
  }

  async ['SUB pollInstances']() {
    if (!this.instances) return;
    const info = this.instances[this.instId];
    if (!info) return;
    await this.update$(info);
  }

  listInstances() {
    this.checkExpires();
    return this.instances;
  }

  static cpuAverage() {
    let totalIdle = 0;
    let totalTick = 0;
    const cpus = os.cpus();

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        if (Object.hasOwnProperty.call(cpu.times, type)) {
          totalTick += cpu.times[type];
        }
      }

      totalIdle += cpu.times.idle;
    }

    const result = {
      idle: totalIdle / cpus.length,
      total: totalTick / cpus.length
    };

    return result;
  }

  checkExpiresJob$() {
    if (!this.checkExpires()) return;
    setTimeout(this.checkExpiresJob, this.$.msecAliveExpires);
  }

  async init() {
    if (this.prefix == null) this.prefix = 'discovery_';
    this.instId = $.newShortId();
  }

  async afterInit() {
    const {instId} = this;
    this.instances = {[instId]: this.info};
    this.nInstances = 1;

    Object.assign(this.info, {srcCreatedAt: new Date()});
    this.instanceUpdate({instId});
    await this.keepAlive$(this.info);
    setTimeout(this.checkExpiresJob, this.$.msecAliveExpires);

    await this.pub('pollInstances', {});
  }

  async final() {
    this.instances = null;
    this.isAlive = false;
    const {instId} = this;
    await this.pub('instanceDown', {instId});
  }
}

Discovery.msecPingAlive = 30000;
Discovery.msecPingRetry = 5000;
Discovery.msecAliveExpires = 60000;

module.exports = Discovery;
