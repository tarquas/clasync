const Web = require('.');
const cors = require('cors');
const compression = require('compression');

const defaultErrors = {
  badRequest: '400 Bad Request',
  badAuth: '401 Unauthorized',
  needPay: '402 Payment Required',
  denied: '403 Forbidden',
  notFound: '404 Not Found',
  conflict: '409 Conflict',
  internal: '500 Internal Server Error'
};

class WebApi extends Web {
  async init() {
    if (this.trustProxy === true) {
      this.app.enable('trust proxy');
    } else if (this.trustProxy) {
      this.app.set('trust proxy', this.trustProxy);      
    }

    this.use(cors({
      allowedHeaders: this.allowedHeaders || ['Content-Type', 'Authorization'],
      exposedHeaders: this.exposedHeaders || ['Content-Type', 'Date'],
      origin: this.origin
    }));

    if (this.compression) this.use(compression({level: this.compression}));
  }

  static get errors() {
    if (Object.hasOwnProperty.call(this, '_errors')) return this._errors;
    this._errors = Object.create(Object.getPrototypeOf(this).errors || defaultErrors);
    return this._errors;
  }

  async response(data, req) {
    req.res.end(`${JSON.stringify(data, null, 2)}\n`);
  }

  async internalError(err, req) {
    const now = new Date().toISOString();
    req.res.status(500);
    if (!this.errorSilent) this.$.throw(err, `WEB ${req.method} ${req.path}`);

    this.response({
      error: 'internal',
      code: err.code,
      message: err.message,
      at: now
    }, req);
  }

  async customError(err, req) {
    if (req.res.statusCode === 200) req.res.status(500);
    this.response(err, req);
  }

  async restError(err, req) {
    const error = this.$.errors[err];
    if (!error) return this.customError(err, req);

    const [ents, code, message] = error.match(this.$.rxErrorDesc) || [];
    if (!ents) return this.customError(err, req);

    const status = code - 0;
    req.res.status(status);

    this.response({
      error: err,
      code: status,
      message
    }, req);

    return true;
  }

  async error(err, req) {
    if (err instanceof Error) return this.internalError(err, req);
    if (err.constructor === String) return this.restError(err, req);
    return this.customError(err, req);
  }

  async json(req) {
    try {
      await super.json(req);
    } catch (err) {
      if (err.type === 'entity.too.large') {
        req.res.status(413);
        throw {error: 'limitExceeded', size: +req.headers['content-length'], limit: req.mwArg};
      }

      throw err;
    }
  }
}

WebApi.rxErrorDesc = /^(\d+)\s+(.*)$/;

module.exports = WebApi;
