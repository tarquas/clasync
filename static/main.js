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

      const mainRunning = this.waitMain && !this.mainFinish;

      if (mainRunning) {
        this.throw('Timed out waiting for main', {title: 'CRITICAL'});
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
      const me = new this(config);
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

    const reason = await this.mainInstance[this.instance].waitFinaled;
    process.exit(reason);
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
