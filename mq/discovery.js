const DbMongo = require('../db/mongo');
const MqDisp = require('./disp');
const os = require('os');
const util = require('util');

class Discovery extends MqDisp {
  // info -- what information to share with
  // db -- if DbMongo instance is specified, info also will include DB stats

  async update$(info) {
    await this.pub('instanceUp', {instId: this.instId, info});
  }

  instanceUpdate({
    instId,
    info
  }) {
    const instInfo = this.instances[instId];
    if (!instInfo) return;

    Object.assign(instInfo, info, {
      updatedAt: new Date(),
      prevCpuAvg: instInfo.cpuAvg
    });

    if (instInfo.prevCpuAvg) {
      const idleDifference = instInfo.cpuAvg.idle - instInfo.prevCpuAvg.idle;
      const totalDifference = instInfo.cpuAvg.total - instInfo.prevCpuAvg.total;

      if (totalDifference) {
        instInfo.cpuAvgLoad = 100 - ((100 * idleDifference) / totalDifference | 0);
      }
    }

    return instInfo;
  }

  instanceDown({
    instId
  }) {
    const info = this.instances[instId];
    if (!info) return;
    delete this.instances[instId];
    this.nInstances--;
  }

  async keepAlive(info = {}) {
    if (!this.isAlive) return;

    Object.assign(info, {
      cpuAvg: this.$.cpuAverage()
    });

    const db = this.$.get(this.db, 'conn', 'db');
    const stats = db && (await util.promisify(db.stats).call(db));

    Object.assign(info, {
      dbDataSize: this.$.get(stats, 'dataSize')
    });

    try {
      await this.pub('instanceUp', {instId: this.instId, info});
    } catch (err) {
      if (this.isAlive) setTimeout(this.keepAliveBound, this.$.msecPingRetry, info);
      return;
    }

    if (this.isAlive) setTimeout(this.keepAliveBound, this.$.msecPingAlive);
  }

  async ['SUB instanceUp']({
    instId,
    info
  }) {
    if (!this.instances) return;

    if (!this.instances[instId]) {
      this.instances[instId] = {};
      this.nInstances++;
    }

    const {cancel, modify} = await this.emit('beforeUp', {instId, info});
    if (cancel) return;

    const allInfo = this.instanceUpdate({instId, info: Object.assign(info, modify)});
    this.emit('up', {instId, info: allInfo});
  }

  async ['SUB instanceDown']({
    instId
  }) {
    if (!this.instances) return;
    const args = {instId, reason: 'managedShutdown'};
    this.instanceDown(args);
    this.emit('down', args);
  }

  async checkExpires() {
    const now = +new Date();
    const insts = this.instances;

    for (const instId in insts) {
      if (Object.hasOwnProperty.call(insts, instId)) {
        const info = insts[instId];

        if (now - info.updatedAt > this.$.msecAliveExpires) {
          const args = {instId, reason: 'pingTimeout'};
          this.instanceDown(args);
          this.emit('down', args);
        }
      }
    }
  }

  async ['SUB pollInstances']() {
    if (!this.instances) return;
    const info = this.instances[this.instId];
    if (!info) return;
    await this.pub('instanceUp', {instId: this.instId, info});
  }

  async listInstances() {
    await this.checkExpires();
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

  async init() {
    if (this.prefix == null) this.prefix = 'discovery_';
    const instId = DbMongo.newShortId();

    this.instances = {[instId]: this.info};
    this.nInstances = 1;

    Object.assign(this, {
      instId,
      isAlive: true,
      keepAliveBound: this.keepAlive.bind(this)
    });

    Object.assign(this.info, {createdAt: new Date()});
    this.instanceUpdate({instId});
    await this.keepAliveBound(this.info);
  }

  async afterInit() {
    await this.pub('pollInstances', {});
  }

  async final() {
    this.isAlive = false;
    await this.pub('instanceDown', {instId: this.instId});
    delete this.keepAliveBound;
  }
}

Discovery.msecPingAlive = 60000;
Discovery.msecPingRetry = 5000;
Discovery.msecAliveExpires = 90000;

module.exports = Discovery;
