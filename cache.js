const Emitter = require('events');

class Cache extends Emitter {
  constructor({
    maxLifetime, // time in milliseconds after which to expire least recently used items or null if unlimited
    maxCount // maximum number of items or null if unlimited
  }) {
    super();
    this.maxLifetime = maxLifetime | 0;
    this.maxCount = maxCount | 0;
    this.cache = Object.create(null);
    this.nCache = 0;
  }

  processExpire({expireAfter, maxCount}) {
    for (const [key, obj] of Object.entries(this.cache)) {
      if ((maxCount && this.nCache > maxCount) || (expireAfter && expireAfter > obj.usedAt)) {
        const evtArg = {key, object: obj.object, cancel: false};
        this.emit('expire', evtArg);
        if (!evtArg.cancel) this.remove(key);
      } else break;
    }
  }

  checkExpire() {
    if (!this.maxLifetime && !this.maxCount) return;
    const expireAfter = this.maxLifetime && (+new Date() - this.maxLifetime);
    this.processExpire({expireAfter, maxCount: this.maxCount});
  }

  add(akey, object) {
    const key = akey + '';
    let obj = this.cache[key];

    if (obj) {
      const evtArg = {key, object, cancel: false};
      this.emit('replace', evtArg);
      if (evtArg.cancel) return;
      this.remove(key);
    }

    else obj = Object.create(null);
    obj.usedAt = +new Date();
    if (object) obj.object = object;
    this.cache[key] = obj;
    this.nCache++;
    this.checkExpire();
  }

  remove(akey) {
    const key = akey + '';
    this.emit('remove', {key});
    delete this.cache[key];
    this.nCache--;
  }

  get(akey) {
    const key = akey + '';
    const obj = this.cache[key];
    if (!obj) return null;
    delete this.cache[key];
    this.cache[key] = obj;
    obj.usedAt = +new Date();
    return obj.object;
  }

  key(akey, def) {
    const object = this.get(akey);
    if (object) return object;
    const key = akey + '';
    const evtArg = {key, object, cancel: false};
    this.emit('add', evtArg);
    if (evtArg.cancel) return null;
    const newObject = def || Object.create(null);
    this.add(akey, newObject);
    return newObject;
  }
}

module.exports = Cache;
