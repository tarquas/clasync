const ClasyncMain = {
  stay() {
    process.stdin.resume();
  },

  async exit(reason) {
    if (!this.mainInstance) return process.exit(reason);
    await this.finish(this.mainInstance, reason);
  },

  async runMain() {
    if (!this.configure) return;

    try {
      const config = await this.configure();
      const me = this.mainInstance = await new this(config);
      const inst = me[this.instance];

      for (const signal of this.exitSignals) {
        process.on(signal, () => this.exit(signal));
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
        const mainRes = await me.main();
        if (mainRes == null) this.stay();
        else this.exit(mainRes);
      } else {
        this.stay();
      }

      const reason = await inst.waitFinaled;
      process.exit(reason);
    } catch (err) {
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
  ]
};

module.exports = ClasyncMain;
