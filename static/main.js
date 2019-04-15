const ClasyncMain = {
  stay() {
    process.stdin.resume();
  },

  async exit(reason, isSignal) {
    if (isSignal) {
      if (this.signalExiting) return process.exit(reason);
      this.signalExiting = true;
    }

    if (this.exiting) return;
    this.exiting = true;

    const main = this.mainInstance;
    if (!main) return process.exit(reason);
    const inst = this.get(main, this.instance);
    this.finish(main, reason);
    await this.delay(this.gracefulShutdownMsec);
    if (!inst.finaled) this.throw('Timed out waiting for finalizers', {title: 'CRITICAL', exit: 2});
  },

  async fail(from, err) {
    await from;
    throw err;
  },

  async runMain() {
    if (!this.configure) return;

    try {
      const config = await this.configure();
      const me = this.mainInstance = await new this(config);
      const inst = me[this.instance];

      for (const signal of this.exitSignals) {
        process.on(signal, () => this.exit(signal, true));
      }

      process.on(
        'unhandledException',
        err => this.throw(err, {title: 'UNHANDLED EXCEPTION', exit: 1})
      );

      process.on(
        'unhandledRejection',
        err => this.throw(err, {title: 'UNHANDLED PROMISE REJECTION'})
      );

      if (me.main) {
        const mainRes = await this.race([me.main(), inst.waitFinaled]);
        if (mainRes == null) this.stay();
        else this.exit(mainRes);
      } else {
        this.stay();
      }

      const reason = await inst.waitFinaled;
      process.exit(reason);
    } catch (err) {
      if (this.mainFatal && await this.mainFatal(err)) return;
      this.throw(err, {title: 'UNHANDLED EXCEPTION', exit: 1});
    }
  },

  async autorun(Module) {
    if (!Module) return;
    await this.tick();
    const Class = Module.exports;
    if (!Class || !Object.isPrototypeOf.call(this, Class)) return;
    await Class.runMain();
  },

  exitSignals: [
    'SIGINT',
    'SIGHUP',
    'SIGTERM'
  ],

  gracefulShutdownMsec: 5000
};

module.exports = ClasyncMain;
