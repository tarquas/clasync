const ClasyncMain = {
  stay() {
    process.stdin.resume();
  },

  exit(reason, isSignal) {
    if (isSignal) {
      if (this.signalExiting) return process.exit(reason);
      this.signalExiting = true;
    }

    if (this.exiting) return this.exiting;

    const main = this.mainInstance;
    if (!main) return process.exit(reason);
    const inst = this.get(main, this.instance);
    this.finish(main, reason);

    this.exiting = (async () => {
      await this.delay(this.gracefulShutdownMsec);

      if (!inst.finaled) {
        this.throw('Timed out waiting for finalizers', {title: 'CRITICAL'});
        process.exit(2);
      }
    })();

    return this.exiting;
  },

  async fail(from, err) {
    await from;
    throw err;
  },

  async runMain() {
    let config = this.configure;
    if (!config) return;

    try {
      if (typeof config === 'function') config = config();
      if (typeof config.then === 'function') config = await config;
      const me = await new this(config)[this.ready];
      this.setMainInstance(me);
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
    if (Class === this) throw '[FATAL] Main module may not be a Clasync class itself';
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
