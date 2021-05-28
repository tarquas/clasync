const $ = require('..');
const socketIo = require('socket.io');
const socketIoClient = require('socket.io-client');
const amqpAdapter = require('./socket-mq');
const util = require('util');

class WebSocket extends $.Emitter {
  prefix = '/socket';  // prefix -- path to endpoint
  // mq -- optional Mq instance to dispatch within a cluster

  // Events:
  async onConnect(req) { return await this.eventEmit('connect', {req, ctx: this}); }  // req
  async onDisconnect(req) { return await this.eventEmit('disconnect', {req, ctx: this}); }  // req

  static type = 'socket';

  static get Mq() { return WebSocket.Mq = require('./socket-mq'); }

  async error(err, {action}) {
    if (!this.errorSilent) this.$.throw(err, `WEBSOCKET ${action}`);
    return true;
  }

  async SUB(handler, {action}, ...args) {
    try {
      await handler.call(this, ...args);
    } catch (err) {
      await this.error(err, {action});
    }
  }

  static rpcMakeError(err) {
    if (err instanceof Error) {
      const encErr = {message: err.message, isError: true};
      return {error: encErr};
    }

    return {error: err};
  }

  async rpc(event, ...args) {
    const result = await new Promise((resolve, reject) => {
      try {
        this.socket.emit(event, args, resolve);
      } catch (err) {
        reject(err);
      }
    });

    if (!result) return result;
    if (result.error) throw new Error(result.error);
    return result.data;
  }

  async RPC(handler, {event, action}, ...args) {
    let result;

    try {
      result = {data: await handler.call(this, ...args)};
    } catch (err) {
      result = this.$.rpcMakeError(err);
      await this.error(err, {action});
    }

    try {
      await this.rpc(event, result);
    } catch (err) {
      // ignore
    }
  }

  addHandler(method, nsp, event, handler) {
    const action = `${method} ${event} ${nsp || '/'}`;

    if (this.subscriptions[action]) {
      throw new Error('Multiple subscriptions to same event not allowed');
    }

    const bound = async function actionHandler(...args) {
      await this.connectReady;
      this[method].call(this, handler, {event, action}, ...args);
    };

    this.subscriptions[action] = {nsp, event, handler: bound};
    return bound;
  }

  addSubscription(action, handler) {
    const [matched, method, event, , nsp] = action.match(this.$.rxSocketSub) || [];
    if (!matched) return;

    this.addHandler(method.toUpperCase(), nsp, event, handler);
  }

  static actionDesc = {
    rxName: /^[!?\s\d\*]*(sub|worker|rpcworker)\s/i,
    rxType: /^function$/
  };

  addSubscriptions() {
    for (const [action, handler] of $.entries($.scanObjectAll(this, this.$.actionDesc))) {
      this.addSubscription(action, handler);
    }
  }

  removeSubscription(action) {
    const sub = this.subscriptions[action];
    if (!sub) return false;
    delete this.subscriptions[action];
    return true;
  }

  removeSubscriptions() {
    for (const action in this.subscriptions) {
      if (Object.hasOwnProperty.call(this.subscriptions, action)) {
        this.removeSubscription(action);
      }
    }
  }

  getNspContext(nsp) {
    if (!nsp) return this.socket;
    return this.socket.of(nsp);
  }

  attachSubscription(action) {
    const sub = this.subscriptions[action];
    const nspCtx = this.getNspContext(sub.nsp);
    const handler = sub.handler.bind(this);
    nspCtx.on(sub.event, handler);
    this.socketSubs[action] = handler;
  }

  attachSubscriptions() {
    for (const action in this.subscriptions) {
      if (Object.hasOwnProperty.call(this.subscriptions, action)) {
        this.attachSubscription(action);
      }
    }
  }

  detachSubscription(action) {
    const sub = this.subscriptions[action];
    const handler = this.socketSubs[action];
    const nspCtx = this.getNspContext(sub.nsp);
    nspCtx.removeListener(sub.event, handler);
    delete this.socketSubs[action];
  }

  detachSubscriptions() {
    for (const action in this.socketSubs) {
      if (Object.hasOwnProperty.call(this.socketSubs, action)) {
        this.detachSubscription(action);
      }
    }
  }

  async connect(r1, r2) {
    return await this.onConnect(r1, r2);
  }

  async connected(socket) {
    let context = this.socketContexts[socket.id];
    if (!context) context = await this.onConnection(socket);
    await context.connectReady;
  }

  async onConnection(socket) {
    let context = this.socketContexts[socket.id];
    if (context) return context;
    context = Object.create(this);
    this.socketContexts[socket.id] = context;
    context.req = socket.handshake;

    Object.assign(context, {
      socket,
      onDisconnectionBound: this.onDisconnection.bind(context),
      socketSubs: this.$.make()
    });

    socket.on('disconnect', context.onDisconnectionBound);

    try {
      context.connectReady = context.connect(context.req, context.req);
      await context.connectReady;
      context.attachSubscriptions();
      socket.emit('connectReady', {name: context.name});
      return context;
    } catch (err) {
      socket.emit('connectError', {name: context.name, ...this.$.rpcMakeError(err)});
      socket.conn.close();
      throw err;
    }
  }

  async disconnect(r1, r2) {
    return await this.onDisconnect(r1, r2);
  }

  async onDisconnection() {
    await this.disconnect(this.req, this.req);
    this.socket.removeListener('disconnect', this.onDisconnectionBound);
    this.detachSubscriptions();
    this.socket.removeAllListeners();
    delete this.socketContexts[this.socket.id];
    delete this.socket;
    delete this.onDisconnectionBound;
    delete this.socketSubs;
  }

  attachToServers(io) {
    if (this.web.http) io.attach(this.web.http);
    if (this.web.https && this.web.https !== this.web.http) io.attach(this.web.https);
  }

  dropAll() {
    for (const ctx of $.values(this.socketContexts)) {
      // ctx.socket.disconnect(false); // BUG: prevents reconnect. how to io.detach?
    }
  }

  async afterInit() {
    const {prefix, mqPrefix} = this;
    this.eventEmit = super.emit;

    const {binds} = this.web.$;
    const bind = `WEBSOCKET ${this.web.bind}${this.web.prefix}${prefix}`;
    let io = binds[bind];

    if (!io) {
      this.primary = true;

      binds[bind] = io = socketIo({
        path: `${this.web.prefix}${prefix}`,
        pingInterval: this.pingInterval || this.$.defaultPingInterval,
        pingTimeout: this.pingTimeout || this.$.defaultPingTimeout,
        transports: ['websocket']
      });

      if (this.adapter) {
        await this.adapter.mq[$.ready];
        this.adapterMaker = amqpAdapter(this.adapter.mq, this.adapter.opts);
        io.adapter(this.adapterMaker);
      }

      this.attachToServers(io);
      io.httpServer = null;  // HACK: to allow multiple sockets to same server
    }

    Object.assign(this, {
      io,
      subscriptions: this.$.make(),
      socketContexts: this.$.make()
    });

    this.addSubscriptions();

    io.on('connect', async (socket) => {
      try {
        await this.onConnection(socket);
      } catch (err) {
        this.$.throw(err, 'WEBSOCKET CONN');
      }
    });
  }

  async final() {
    this.dropAll();
    if (this.adapterMaker) await $.all($.mapIter(this.adapterMaker.adapters, adapter => adapter.finishMq()));
    if (this.primary) await util.promisify(this.io.close).call(this.io);
    //this.removeSubscriptions();
    //delete this.io;
    //delete this.subscriptions;
    //delete this.socketContexts;
  }

  async join(rooms) {
    return await this.socket.join(rooms);
  }

  async leave(room) {
    return await this.socket.leave(room);
  }

  emit(event, msg) {
    return this.socket.emit(event, msg);
  }

  to(rooms, event, msg) {
    return this.io.to(rooms).emit(event, msg);
  }
}

WebSocket.defaultPingInterval = 25000;
WebSocket.defaultPingTimeout = 60000;

WebSocket.rxSocketSub = /^(\w+)\s+(\S+)(\s+(\/\S+))?((\s*>\s*[^\s>]+)*)$/;

WebSocket.Client = socketIoClient;

module.exports = WebSocket;
