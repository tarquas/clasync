const {Adapter} = require('socket.io-adapter');
const $ = require('../db/mongo');

class MqAdapter extends Adapter {
  constructor(nsp, mq, options) {
    super(nsp);

    this.opts = {
      channelSeperator: '#',
      prefix: mq.prefix || '',
      ...options,
    };

    this.myId = $.newShortId();
    //this.encoder = this.nsp.adapter.encoder;
    this.event = `${this.opts.prefix}-socket.io`;
    this.subs = $.make();
    this.mq = mq;
    this.onmessageBound = this.onmessage.bind(this);
    this.globalRoomName = this.getChannelName(this.event, this.nsp.name);
    this.connected = this.initMq();
  }

  getChannelName(...args) {
    return args.join(this.opts.channelSeperator) + this.opts.channelSeperator;
  }

  async initMq() {
    await this.mq[$.ready];
    this.globalSubId = await this.mq.sub(this.globalRoomName, this.onmessageBound);
  }

  async finishMq() {
    if (this.globalSubId) await this.mq.unhandle(this.globalSubId);
    this.globalSubId = null;

    if (this.subs) await $.all($.mapIter($.values(this.subs), id => this.mq.unhandle(id)));
    this.subs = null;
  }

  onmessage({id, data: [packet, bOpts]}) {
    if (!id || id === this.myId) return;

    if (packet && !packet.nsp) packet.nsp = '/';
    if (!packet || packet.nsp !== this.nsp.name) return;

    bOpts.rooms = new Set(bOpts.rooms);
    bOpts.except = new Set(bOpts.except);

    super.broadcast(packet, bOpts);
  }

  add(id, room, fn) {
    return this.addAll(id, [room], fn);
  }

  async addAll(id, rooms, fn) {
    try {
      await this.connected;

      if (this.subs) await $.all($.mapIter(rooms, async (room) => {
        const needToSubscribe = !this.rooms.has(room);
        if (!needToSubscribe) return;
        const event = this.getChannelName(this.event, this.nsp.name, room);
        this.subs[event] = await this.mq.sub(event, this.onmessageBound);
      }));

      super.addAll(id, rooms);

      if (fn) fn();
    } catch (err) {
      this.emit('error', err);
      if (fn) fn(err); else throw err;
    }
  }

  async broadcast(packet, bOpts, remote) {
    super.broadcast(packet, bOpts);
    await this.connected;
    bOpts.rooms = Array.from(bOpts.rooms);
    bOpts.except = Array.from(bOpts.except);

    if (!remote) {
      const data = [packet, bOpts];

      if (bOpts.rooms && bOpts.rooms.length) {
        const all = await $.all($.mapIter(bOpts.rooms, async (room) => {
          const event = this.getChannelName(this.event, packet.nsp, room);
          await this.mq.pub(event, {id: this.myId, data});
        }));

        return all;
      }

      const result = await this.mq.pub(this.globalRoomName, {id: this.myId, data});
      return result;
    }

    return null;
  }

  async del(id, room, fn) {
    try {
      await this.connected;

      if (this.subs && this.rooms.has(room)) {
        const event = this.getChannelName(this.event, this.nsp.name, room);
        await this.mq.unhandle(this.subs[event]);
        delete this.subs[event];
      }

      super.del(id, room);
      if (fn) fn();
    } catch (err) {
      this.emit('error', err);
      if (fn) fn(err);
    }
  }

  async delAll(id, fn) {
    try {
      await this.connected;
      const rooms = this.sids.get(id);

      if (this.subs && rooms) await $.all($.mapIter($.keys(rooms), async (roomId) => {
        if (this.rooms.has(roomId)) {
          const event = this.getChannelName(this.event, this.nsp.name, roomId);
          await this.mq.unhandle(this.subs[event]);
          delete this.subs[event];
        }
      }));

      super.delAll(id);
      if (fn) fn();
    } catch (err) {
      this.emit('error', err);
      if (fn) fn(err);
    }
  }
}

const adapterMaker = (mq, options) => {
  const maker = function (nsp) {
    const adapter = new MqAdapter(nsp, mq, options);
    maker.adapters.add(adapter);
    return adapter;
  };

  maker.adapters = new Set();
  return maker;
};

adapterMaker.createAdapter = adapterMaker;
module.exports = adapterMaker;
