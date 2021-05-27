const {$, Mq} = require('../..');

class Master extends Mq.Discovery {
  static masterAttemptDelayMsec = 3000;  // how many msec to wait for MQ bus
  masterAttemptDelayMsec = this.$.masterAttemptDelayMsec;
  // `.info.service` must be defined to isolate instances for specific service

  // Events:
  onMasterAttempt(p) { return this.emit('masterAttempt', p); }  // {retake}
  onMasterGiveUp(p) { return this.emit('masterGiveUp', p); }  // {otherId, retake}
  onMasterAchieve(p) { return this.emit('masterAchieve', p); }  // {retake}

  async init() {
    this.takePowerAttemptTask = setTimeout(
      this.takePowerAttempt,
      this.masterAttemptDelayMsec
    );
  }

  takePowerAttempt$() {
    this.takePowerAttemptTask = null;

    for (const [, {service, isMasterCandidate}] of this.listIter()) {
      if (isMasterCandidate && service === this.info.service) return;
    }

    this.update$({isMasterCandidate: true});
    this.onMasterAttempt({retake: false});
  }

  takePower() {
    if (this.tookPower) return;
    this.tookPower = true;
    this.update$({isMaster: true});
  }

  onUp(p) {
    const {instId, info: {service, isMasterCandidate, isMaster}} = p;
    if (this.masterId || service !== this.info.service) return super.onUp(p);

    if (instId === this.instId && isMasterCandidate) {
      for (const [otherId, info] of this.listIter()) {
        if (
          otherId === instId ||
          service !== info.service ||
          !info.isMasterCandidate
        ) continue;

        if (info.isMaster) {
          if (isMaster) {
            this.onMasterGiveUp({otherId, retake: true});
            this.masterId = otherId;
            this.update$({isMaster: false});
          }

          return;
        }

        if (!isMaster) {
          this.onMasterGiveUp({otherId, retake: false});
          this.masterId = otherId;
          return;
        }
      }

      if (isMaster) {
        const retake = this.masterId === null;
        this.masterId = instId;
        this.onMasterAchieve({retake});
      } else {
        this.takePower();
      }
    } else {
      // if (isMaster) this.masterId = instId;

      if (this.takePowerAttemptTask && isMasterCandidate) {
        clearTimeout(this.takePowerAttemptTask);
        this.takePowerAttemptTask = null;
      }
    }

    return super.onUp(p);
  }

  onDown(p) {
    const {instId, info: {service, isMaster}} = p;
    if (!isMaster || service !== this.info.service) return super.onDown(p);

    this.onMasterAttempt({retake: true, otherId: instId});
    this.masterId = null;

    this.update$({isMaster: true, isMasterCandidate: true});
    return super.onDown(p);
  }
}

module.exports = Master;
