const Clasync = require('..');
const basicAuth = require('basic-auth');
const express = require('express');
const httpoly = require('httpolyglot');
const http = require('http');
const https = require('https');
const util = require('util');

class Web extends Clasync {
  // httpBind : a HTTP port or host:port to listen
  // httpOpts : HTTP connection options
  // httpsBind : a HTTPS port or host:port to listen
  // httpsOpts : HTTPS connection options
  // prefix : prefix paths with given string

  static get type() { return 'web'; }

  static get Api() { return require('./api'); }
  static get Rest() { return require('./rest'); }
  static get Socket() { return require('./socket'); }
  static get SocketMq() { return require('./socket-mq'); }
  static get Upload() { return require('./upload'); }

  createServers() {
    const bind = `WEB ${this.bind}`;
    const exists = Web.binds[bind];

    if (exists) {
      Object.assign(this, exists);
      this.primary = false;
    } else {
      this.app = express();

      if (this.httpBind && (this.httpBind === this.httpsBind || this.httpsBind === true)) {
        this.http = httpoly.createServer({...this.httpOpts, ...this.httpsOpts}, this.app);
        this.https = this.http;
      } else {
        if (this.httpBind) this.http = http.Server(this.app, this.httpOpts);
        if (this.httpsBind) this.https = https.Server(this.app, this.httpsOpts);
      }

      Web.binds[bind] = {app: this.app, http: this.http, https: this.https};
      this.primary = true;
    }
  }

  use(middleware) {
    if (!this._prefix) return this.app.use(middleware);
    return this.app.use(this._prefix, middleware);
  }

  async listenFind(app, port, find) {
    if (!app) return null;
    let p = port;

    while (true) {
      try {
        const event = this.$.waitEvent(app, 'listening', 'error');
        app.listen(p);
        await event;
        return p;
      } catch (err) {
        if (!find || err.data.code !== 'EADDRINUSE') throw err.data;
        if (++p === 65536) throw err.data;
      }
    }
  }

  async ready() {
    if (this.isReady) return;
    this.isReady = true;
    if (!this.primary) return;

    this.httpBound = await this.listenFind(this.http, this.httpBind, this.httpFind);

    if (this.https !== this.http) {
      this.httpsBound = await this.listenFind(this.https, this.httpsBind, this.httpsFind);
    } else {
      this.httpsBound = this.httpBound;
    }
  }

  async init() {
    this._prefix = this.prefix || '';
    this.bind = this.httpBind || this.httpsBind;
    this.createServers();
  }

  async afterInit() {
    if (!this.confirmReady) await this.ready();
  }

  async response(data, req) {
    req.res.end(data);
  }

  async error(err, req) {
    if (!this.errorSilent) this.$.throw(err, `REST ${req.method} ${req.path}`);
    req.res.status(500);
    req.res.end(err.message || JSON.stringify(err, null, 2));
  }

  async final() {
    if (this.primary) {
      if (this.http) this.http.close();
      if (this.https && this.https !== this.http) this.https.close();
    }

    delete this.app;
    delete this.http;
    delete this.https;
  }
}

Object.assign(Web, {express, static: express.static, basicAuth});
Web.binds = Web.makeObject();

module.exports = Web;
