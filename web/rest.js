const Clasync = require('..');

class WebRest extends Clasync.Emitter {
  // web -- webserver (class Web) instance
  prefix = '';  // REST group prefix

  static type = 'rest';

  async express(middleware, req) {
    return this.web.express(middleware, req);
  }

  async callHandler(handler, req, context) {
    let result;
    const ctx = context || this;

    if (Object.getPrototypeOf(handler).constructor.name === 'AsyncFunction') {
      result = await handler.call(ctx, req, req);
    } else {
      result = await this.express.call(ctx, handler, req);
    }

    return result;
  }

  async processMiddlewares(names, req) { // eslint-disable-line
    for (const name of names) {
      const [, mwName, mwArg] = name.match(this.$.rxMiddlewareCall);
      const fields = mwName.split('.');
      let p = this.web;
      let context = null;

      for (const field of fields) {
        context = p;
        p = field ? p[field] : this;
        if (!p) throw new Error(`Property ${field} not found in ${name} middleware`);
      }

      req.mwArg = mwArg;
      await this.callHandler(p, req, context); // eslint-disable-line
    }
  }

  wrapToMiddleware(handler, middleware) {
    return async (req, res, next) => {
      try {
        if (middleware) {
          const names = middleware.match(this.$.rxMiddleware);
          if (!names) return;
          await this.processMiddlewares(names, req);
        }

        const data = await this.callHandler(handler, req);

        if (data) {
          await this.web.response(data, req);
        } else {
          next();
        }
      } catch (err) {
        await this.web.error(err, req);
      }
    };
  }

  addRoute(action, customHandler) {
    const [matched, method, path, middleware] = action.match(this.$.rxMethodPath) || [];
    if (!matched) return;
    const handler = customHandler || this[action];
    const func = this.web.router[method.toLowerCase()];

    if (func) {
      func.call(
        this.web.router,
        `${this.web.prefix}${this.prefix}${path}`,
        this.wrapToMiddleware(handler, middleware)
      );
    }
  }

  async afterInit() {
    for (const action of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      this.addRoute(action);
    }

    if (this.notFound) this.web.app.use(this.wrapToMiddleware(this.notFound));
  }
}

WebRest.rxMethodPath = /^(\w+)\s+(\S+)((\s*>\s*[^\s>]+)*)$/;
WebRest.rxMiddleware = /[^\s>]+/g;
WebRest.rxMiddlewareCall = /^([^\s>\(]+)(?:\(([^\)]*)\))?$/;
WebRest.rxFollow = /[^.]+/g;

module.exports = WebRest;
