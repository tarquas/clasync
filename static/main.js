const ClasyncMain = {
  stay() {
    process.stdin.resume();
  },

  processExit(exitCode, reason) {
    if (exitCode && reason) this.throw(reason, {title: 'CRITICAL'});
    process.exit(exitCode);
  },

  exit(reason, isSignal) {
    const numReason = !reason ? 0 : typeof reason === 'number' ? reason : 1;

    if (isSignal) {
      if (this.signalExiting) return this.processExit(numReason, reason);
      this.signalExiting = true;
    }

    if (this.exiting) return this.exiting;

    const main = this.mainInstance;
    if (!main) return this.processExit(numReason, reason);
    const inst = this.get(main, this.instance);
    this.finish(main, reason);

    this.exiting = (async () => {
      await this.delay(this.gracefulShutdownMsec);
      if (!inst.finaled) this.processExit(2, `Timed out waiting for finalizers. Exit Reason:\n${reason}`);

      const mainRunning = this.waitMain && !this.mainFinish;
      if (mainRunning) this.processExit(2, `Timed out waiting for main. Exit Reason:\n${reason}`);
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
    let me;

    try {
      if (typeof config === 'function') config = config();
      if (typeof config.then === 'function') config = await config;
      me = new this(config);
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

      try {
        await me[this.ready];
        this.mainInited = true;
      } catch (err) {
        if (!this.mainFatal || !await this.initFatal(err)) {
          this.throw(err, {title: 'INIT EXCEPTION', exit: 1});
        }
      }

      if (this.mainInited && !me[this.final] && !this.exiting) {
        if (me.main) {
          this.waitMain = me.main(process.argv);
          const mainRes = await this.waitMain;
          this.mainFinish = true;
          if (mainRes == null) this.stay();
          else this.exit(mainRes);
        } else {
          this.stay();
        }
      }
    } catch (err) {
      this.mainFinish = true;
      if (this.mainFatal && await this.mainFatal(err)) return;
      this.throw(err, {title: 'MAIN EXCEPTION', exit: 1});
    }

    if (!me) return process.exit(1);
    const reason = await me[this.instance].waitFinaled;
    if (!reason) return process.exit(0);
    if (typeof reason === 'number') return process.exit(reason);
    process.exit(1);
  },

  async autorun(Module) {
    await this.tick();
    if (this.mainInstance) throw new Error('Main instance is already set');
    let Class;

    if (!Module) {
      Class = this.mainClass;
      if (!Class) Module = this.mainModule || require.main;
    }

    if (!Class) Class = !Module || Object.isPrototypeOf.call(this, Module) ? Module : Module.exports;
    if (!Object.isPrototypeOf.call(this, Class)) return;

    if (Class === this) throw new Error('Main module may not be a Clasync class itself');
    if (Class) await Class.runMain();
  },

  exitSignals: [
    'SIGINT',
    'SIGHUP',
    'SIGTERM'
  ],

  gracefulShutdownMsec: 5000
};

module.exports = ClasyncMain;
