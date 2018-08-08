const Clasync = require('.');

class ClasyncEmitter extends Clasync {
	async init() {
		this.handlersByEvent = {};
	}

	on(event, handler, pre) {
		let handlers = this.handlersByEvent[event];
		if (!handlers) this.handlersByEvent[event] = handlers = new Map();
		handlers.set(handler, pre);
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

	emitHandlers(entries, ...args) {
		const promises = entries.map(([handler]) => handler(...args));

		for (const promise of promises) {
			if (promise instanceof Promise) return (async () => {
				const results = await Clasync.all(promises);
				return this.reduce(results);
			})();
		}

		return this.reduce(promises);
	}

	emit(event, ...args) {
		const handlers = this.handlersByEvent[event];
		if (!handlers) return 0;

		const entries = Array.from(handlers.entries());
		const preEntries = entries.filter(([, pre]) => pre);
		const postEntries = entries.filter(([, pre]) => !pre);

		const preHandled = this.emitHandlers(preEntries, ...args);

		if (preHandled instanceof Promise) {
			return (async () => {
				const res = await preHandled;
				if (res) return res;
				const postHandled = this.emitHandlers(postEntries, ...args);
				if (postHandled instanceof Promise) return await postHandled;
				return postHandled;
			})();
		} else {
			if (preHandled) return preHandled;
			return this.emitHandlers(postEntries, ...args);
		}
	}
}

module.exports = ClasyncEmitter;
