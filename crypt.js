const crypto = require('crypto');

class Crypt {
  constructor(password, nFlags) {
    if (!password) throw new Error('Password must be specified');
    const p = password.toString();
    if (p.length < 16) throw new Error('Password must be at least 16 characters');
    this.iv = p.substr(0, 8);
    this.password = p.substr(8);
    this.nFlags = nFlags;
    this.algorithm = this.constructor.defaultAlgorithm;
  }

  static toUrlSafe(base64) {
    const ents = base64.match(this.toUrlSafeRx);
    const result = ents.map(ent => this.toUrlSafeMap[ent] || ent).join('');
    return result;
  }

  static fromUrlSafe(base64) {
    const ents = base64.match(this.fromUrlSafeRx);
    const result = ents.map(ent => this.fromUrlSafeMap[ent] || ent).join('');
    return result;
  }

  encrypt(text, flags) {
    const noise = parseInt(Math.random() * 0xffffff, 10);
    const noiseBase = (noise & (-1 << this.nFlags)) | flags;
    const noiseHex = noiseBase.toString(16);
    const noiseHexA = ('000000').substr(noiseHex.length) + noiseHex;
    const noise64 = Buffer.from(noiseHexA, 'hex').toString('base64');

    const cipher = crypto.createCipheriv(this.algorithm, this.password, this.iv);
    let crypted = cipher.update(noise64 + text, 'base64', 'base64');
    crypted += cipher.final('base64');

    const result = this.constructor.toUrlSafe(crypted);
    return result;
  }

  decrypt(text) {
    const base64 = this.constructor.fromUrlSafe(text);

    const decipher = crypto.createDecipheriv(this.algorithm, this.password, this.iv);
    let dec = decipher.update(base64, 'base64', 'base64');
    dec += decipher.final('base64');

    const noise = parseInt(Buffer.from(dec.substr(0, 4), 'base64').toString('hex'), 16);
    const flags = noise & ((1 << this.nFlags) - 1)
    const result = dec.substr(4);
    return {result, flags};
  }

  static parseUserId(sUserId) {
    if (!sUserId) return null;
    const userId = sUserId.toString();
    if (userId.length === 24) return Buffer.from(userId, 'hex');
    if (userId.length === 16) return Buffer.from(userId, 'base64');
    return null;
  }

  // tokenData = {
  //   userId: Hex[24] | Base64[16],
  //   expiresAt: Date,
  //   rev: Int24
  // }

  getToken(tokenData) {
    const {userId} = tokenData;
    const ubuf = this.constructor.parseUserId(userId);

    if (!ubuf || ubuf.length !== 12) throw new Error('Token User ID is invalid');

    const buf = Buffer.alloc(6);
    buf.writeUIntBE(tokenData.expiresAt / 60000, 0, 4);
    buf.writeUIntLE((tokenData.rev & 0xFFFF), 4, 2);

    let checkSum = 0;
    for (let i = 0; i < 6; i += 3) checkSum ^= buf.readUIntBE(i, 3);
    for (let i = 0; i < 12; i += 3) checkSum ^= ubuf.readUIntBE(i, 3);
    const cbuf = Buffer.alloc(3);
    cbuf.writeUIntBE(checkSum, 0, 3);

    const text = cbuf.toString('base64') + buf.toString('base64') + ubuf.toString('base64');

    const flags = (tokenData.flags && parseInt(tokenData.flags.map(Number).join(''), 2)) | 0;
    const result = this.encrypt(text, flags);
    return result;
  }

  // {
  //   format: null -- ShortId, else a Buffer format
  // }

  checkToken(token, format) {
    try {
      if (token.length !== 43) return null;
      const {result: text, flags} = this.decrypt(token);
      if (text.length !== 28) return null;

      const result = {};

      const buf = Buffer.from(text.substr(0, 12), 'base64');
      const testCheckSum = buf.readUIntBE(0, 3);
      result.expiresAt = new Date(buf.readUIntBE(3, 4) * 60000);
      result.rev = buf.readUIntLE(7, 2);

      const userId = text.substr(12, 16);
      const ubuf = Buffer.from(userId, 'base64');
      if (format === 'base64') result.userId = userId;
      else if (format) result.userId = ubuf.toString(format);
      else result.userId = this.constructor.toUrlSafe(userId);

      let checkSum = 0;
      for (let i = 3; i < 9; i += 3) checkSum ^= buf.readUIntBE(i, 3);
      for (let i = 0; i < 12; i += 3) checkSum ^= ubuf.readUIntBE(i, 3);
      if (checkSum !== testCheckSum) return null;

      if (this.nFlags) {
        const bin = flags.toString(2);
        result.flags = bin.padStart(this.nFlags, 0).split('').map(Number);
      }

      return result;
    } catch (err) {
      if (this.constructor.errorBadDecrypt.test(err.message)) return null;
      throw err;
    }
  }
}

Crypt.defaultAlgorithm = 'bf-cbc';

Crypt.toUrlSafeRx = /\+|\/|[\w-]+/g;

Crypt.toUrlSafeMap = {
  '+': '-',
  '/': '_'
};

Crypt.fromUrlSafeRx = /-|_|[\da-zA-Z]+/g;

Crypt.fromUrlSafeMap = {
  '-': '+',
  _: '/'
};

Crypt.errorBadDecrypt = /^error:060650/;

module.exports = Crypt;
