const Clasync = require('..');
const basicAuth = require('basic-auth');
const express = require('express');
const httpoly = require('httpolyglot');
const http = require('http');
const https = require('https');
const util = require('util');
const os = require('os');
const body = require('body-parser');
const Multer = require('multer');

class Web extends Clasync.Emitter {
  // httpBind : a HTTP port or host:port to listen
  // httpOpts : HTTP connection options
  // httpsBind : a HTTPS port or host:port to listen
  // httpsOpts : HTTPS connection options
  prefix = '';  // prefix : prefix paths with given string

  static type = 'web';

  static get Api() { return require('./api'); }
  static get Rest() { return require('./rest'); }
  static get Socket() { return require('./socket'); }
  static get SocketMq() { return require('./socket-mq'); }

  async onAppCreated(bind) {
    // virtual
  }

  async createServers() {
    const bind = `WEB ${this.bind}`;
    const exists = Web.binds[bind];

    if (exists) {
      Object.assign(this, exists);
      this.primary = false;
    } else {
      this.app = express();
      this.router = new express.Router();
      await this.onAppCreated(bind);

      this.app.use(this.router);

      if (this.httpBind && (this.httpBind === this.httpsBind || this.httpsBind === true)) {
        this.http = httpoly.createServer({...this.httpOpts, ...this.httpsOpts}, this.app);
        this.https = this.http;
      } else {
        if (this.httpBind) this.http = http.Server(this.app, this.httpOpts);
        if (this.httpsBind) this.https = https.Server(this.app, this.httpsOpts);
      }

      Web.binds[bind] = this.$.pick(this, 'app', 'router', 'http', 'https');
      this.primary = true;
    }
  }

  use(middleware) {
    if (!this.prefix) return this.router.use(middleware);
    return this.router.use(this.prefix, middleware);
  }

  async express(middleware, req) {
    const result = await new Promise((resolve, reject) => {
      try {
        middleware.call(
          this,
          req,
          req.res,
          data => (data instanceof Error ? reject(data) : resolve(data))
        );
      } catch (err) {
        reject(err);
      }
    });

    return result;
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
    const multer = Multer({dest: os.tmpdir(), limits: this.limits});
    this.bind = this.httpBind || this.httpsBind;
    await this.createServers();
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

  async json(req) {
    const result = await this.express(body.json({limit: req.mwArg}), req);
    return result;
  }

  async form(req) {
    const result = await this.express(this.multer.none(), req);
    return result;
  }

  async file(req) {
    const result = await this.express(this.multer.single(req.mwArg), req);
    return result;
  }

  async files(req) {
    const result = await this.express(this.multer.array(req.mwArg), req);
    return result;
  }

  //TODO: jsonArray()

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

Object.assign(Web, {express, static: express.static, basicAuth, Multer, body});
Web.binds = Web.makeObject();

module.exports = Web;
