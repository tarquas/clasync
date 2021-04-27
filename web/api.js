const Web = require('.');
const cors = require('cors');
const compression = require('compression');

const defaultErrors = {
  apiNotFound: '404 API Endpoint Not Found',
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
      origin: this.origin,
      ...this.corsOpts,
    }));

    if (this.compression) this.use(compression({
      level: this.compression,
      ...this.compressOpts,
    }));
  }

  async notFoundMiddleware$(req, res) {
    res.end(await this.restError('apiNotFound', req));
  }

  async afterInit() {
    this.app.use(this.notFoundMiddleware);
  }

  static get errors() {
    if (Object.hasOwnProperty.call(this, '_errors')) return this._errors;
    this._errors = Object.create(Object.getPrototypeOf(this).errors || defaultErrors);
    return this._errors;
  }

  static apiIterFormat = {
    jsonPart: {
      pfx: '{\n"data": [\n\n', cpfx: ',\n', sep: ',\n',
      csfx: '', sfx: '\n\n]', mpfx: ',\n', msfx: '',
      endsfx: '\n}\n'
    },
    jsonStream: {
      pfx: '[', cpfx: '[', sep: ',',
      csfx: ']', sfx: '{', mpfx: '', msfx: '',
      endsfx: '}'
    },
  };

  async response(data, req) {
    if (!data) return req.res.end();
    if (typeof data !== 'object') req.res.end(data.toString());
    if (data instanceof Error) return await this.internalError(data, req);

    if (!(data instanceof Array) && this.$.iteratorAsync(data)) {
      const meta = data.metadata || req.iterMetadata || this.$.make();
      let has = false;
      const cur = this.$.stopAsync(data, () => req.aborted);

      const raw = req.iterRawOutput;
      const {pfx, cpfx, sep, csfx, sfx, mpfx, msfx, endsfx} = this.$.apiIterFormat.jsonPart;

      try {
        for await (const nexts of this.$.chunkAsync(cur, req.iterChunkSize || 20)) {
          if (!has && !req.res.headersSent) {
            req.res.status(200);
            req.res.header('Content-Type', 'application/json; charset=utf-8');
          }

          if (raw) {
            await req.res.write(nexts);
          } else {
            const jsons = this.$.mapIter(nexts, item => this.$.jsonString(item, 2));
            let data = this.$.sepIter(jsons, sep);
            data = this.$.flattenIter(has ? cpfx : pfx, data, csfx);
            await req.res.write(this.$.stringIter(data));
          }

          has = true;
        }

        if (raw) {
          req.res.end(meta);
        } else if (this.$.hasKeys(meta)) {
          const ents = this.$.entries(meta);

          const jsons = this.$.mapMultiIter(ents, ([k, v]) => (
            v === undefined ? null : `${this.$.jsonString(k)}: ${this.$.jsonString(v, 2)}`
          ));

          const data = this.$.sepIter(jsons, sep);
          const out = this.$.flattenIter(has ? null : pfx, sfx, sep, data, endsfx);
          const str = this.$.stringIter(out);
          req.res.end(str);
        } else {
          req.res.end((has ? '' : pfx) + sfx + endsfx);
        }

        return;
      } catch (err) {
        if (raw) {
          req.res.end({error: err.message || err});
        } else {
          this.$.throw(err, `WEB ITER @ ${req.method} ${req.originalUrl}\n`);
          const data = this.$.flattenIter('"error": ', this.$.jsonString(err.message || err));
          const out = this.$.flattenIter(has ? null : pfx, sfx, sep, data, endsfx);
          const str = this.$.stringIter(out);
          req.res.end(str);
        }

        return;
      }
    }

    if (!req.res.headersSent) req.res.header('Content-Type', 'application/json; charset=utf-8');
    req.res.end(`${this.$.jsonString(data, 2)}\n`);
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
    if (!req.res.headersSent) req.res.header('Content-Type', 'application/json; charset=utf-8');
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
