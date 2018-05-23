const Clasync = require('.');

class ClasyncEmitter extends Clasync {
	async init() {
		this.handlersByEvent = {};
	}

	on(event, handler) {
		let handlers = this.handlersByEvent[event];
		if (!handlers) this.handlersByEvent[event] = handlers = new Map();
		handlers.set(handler, true);
	}

	off(event, handler) {
		const handlers = this.handlersByEvent[event];
		if (!handlers) return;
		handlers.delete(handler);
		if (!handlers.size) delete this.handlersByEvent[event];
	}

	reduce(results) {
		const result = results.reduce((v1, v2) => {
			const n1 = v1 | 0;
			const n2 = v2 | 0;
			return n1 > n2 ? n1 : n2;
		}, 0);

		return result;
	}

	emit(event, ...args) {
		const handlers = this.handlersByEvent[event];
		if (!handlers) return 0;
		const entries = Array.from(handlers.entries());
		const promises = entries.map(([handler, context]) => handler(...args));

		for (const promise of promises) {
			if (promise instanceof Promise) return (async () => {
				const results = await Clasync.all(promises);
				return this.reduce(results);
			})();
		}

		return this.reduce(promises);
	}
}

module.exports = ClasyncEmitter;
