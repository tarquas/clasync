const ClasyncFunc = {
  echo(arg) {
    return arg;
  },

  async aecho(arg) {
    return arg;
  },

  get(object, ...walk) {
    let p = object;

    for (const step of walk) {
      if (p == null) return p;
      p = p[step];
    }

    return p;
  },

  set(object, ...walk) {
    let p = object;
    if (p == null) return p;
    const value = walk.pop();
    const last = walk.pop();

    for (const step of walk) {
      if (p[step] == null) p[step] = typeof step === 'number' ? [] : {};
      p = p[step];
    }

    p[last] = value;
    return p;
  }
};

module.exports = ClasyncFunc;
