class Cache {
  constructor({
    maxLifetime, // time in milliseconds after which to expire least recently used items or null if unlimited
    maxCount // maximum number of items or null if unlimited
  }) {
    this.maxLifetime = maxLifetime | 0;
    this.maxCount = maxCount | 0;
    this.cache = this.$.makeObject();
    this.nCache = 0;
  }

  added(key, object) {
    // virtual
  }

  expired(key, object) {
    // virtual
  }

  processExpire({expireAfter, maxCount}) {
    for (const [key, obj] of Object.entries(this.cache)) {
      if ((maxCount && this.nCache > maxCount) || (expireAfter && expireAfter > obj.usedAt)) {
        this.expired(key, obj.object);
        this.remove(key);
      } else break;
    }
  }

  checkExpire() {
    if (!this.maxLifetime && !this.maxCount) return;
    const expireAfter = this.maxLifetime && (+new Date() - this.maxLifetime);
    this.processExpire({expireAfter, maxCount: this.maxCount});
  }

  add(key, object) {
    let obj = this.cache[key];
    if (obj) this.remove(key);
    else obj = this.$.makeObject();
    obj.usedAt = new Date() - 0;
    if (object) obj.object = object;
    this.cache[key] = obj;
    this.nCache++;
    this.added(key, object);
    this.checkExpire();
  }

  remove(key) {
    this.emit('remove', key);
    delete this.cache[key];
    this.nCache--;
  }

  get(key) {
    const obj = this.cache[key];
    if (!obj) return null;
    obj.usedAt = new Date() - 0;
    return obj.object;
  }
}

module.exports = Cache;
