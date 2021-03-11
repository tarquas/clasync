const {Adapter} = require('socket.io-adapter');
const DbMongo = require('../db/mongo');

const adapterMaker = (mq, options) => {
  const opts = {
    channelSeperator: '#',
    prefix: mq.prefix || '',
    ...options
  };

  const myId = DbMongo.newShortId();
  const {prefix} = opts;

  const getChannelName = (...args) => (args.join(opts.channelSeperator) + opts.channelSeperator);

  class MqAdapter extends Adapter {
    constructor(nsp) {
      super(nsp);
      this.encoder = this.nsp.adapter.encoder;
      this.event = `${prefix}-socket.io`;
      this.subs = DbMongo.makeObject();
      this.mq = mq;
      this.onmessageBound = this.onmessage.bind(this);
      this.connected = this.initMq();
    }

    async initMq() {
      this.globalRoomName = getChannelName(this.event, this.nsp.name);
      this.globalSubId = await this.mq.sub(this.globalRoomName, this.onmessageBound);
    }


    onmessage(msg) {
      if (this.myId === msg.id || !msg.id) return;
      const args = msg.data;
      const packet = args[0];
      if (packet && !packet.nsp) packet.nsp = '/';
      if (!packet || packet.nsp !== this.nsp.name) return;
      args.push(true);
      super.broadcast(args);
    }

    add(id, room, fn) {
      return this.addAll(id, [room], fn);
    }

    async addAll(id, rooms, fn) {
      try {
        await this.connected;

        await DbMongo.all(DbMongo.mapIter(rooms, async (room) => {
          const needToSubscribe = !this.rooms.has(room);
          if (!needToSubscribe) return;
          const event = getChannelName(this.event, this.nsp.name, room);
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

      if (!remote) {
        const data = [packet, bOpts];

        if (bOpts.rooms && bOpts.rooms.length) {
          const all = await DbMongo.all(DbMongo.mapIter(bOpts.rooms, async (room) => {
            const event = getChannelName(this.event, packet.nsp, room);
            await this.mq.pub(event, {id: myId, data});
          }));

          return all;
        }

        const result = await this.mq.pub(this.globalRoomName, {id: myId, data: [packet, opts]});
        return result;
      }

      return null;
    }

    async del(id, room, fn) {
      try {
        await this.connected;

        if (this.rooms.has(room)) {
          const event = getChannelName(this.event, this.nsp.name, room);
          await this.mq.unhandle(this.subs[event]);
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

        if (rooms) await DbMongo.all(DbMongo.mapIter(DbMongo.keys(rooms), async (roomId) => {
          if (this.rooms.has(roomId)) {
            const event = getChannelName(this.event, this.nsp.name, roomId);
            await this.mq.unhandle(this.subs[event]);
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

  return MqAdapter;
};

module.exports = adapterMaker;
