
# clasync
**[Node.js]** *CL*ASses AS*YNC*hronous
*Your powerful asynchronous imperative code OOP framework.*
Latest version: 2.0.0

`npm i -S clasync`

## Lazy bone
Below is a bunch of intuitive stuff and main explanations on lifecycle of this framework.

`dep.js`
```js
const Clasync = require('clasync');

class Dep extends Clasync {  // this class extends framework directly

  // framework handlers

  async init() {  // initialization
    const msec = this.$.msecForInit;  // get our static value
    await this.$.delay(msec);  // call framework method: wait before continue
    console.log(`Dep is ready in ${msec} msec`);
  }

  async final() {  // finalization
    await this.$.doCommonFinal(this.$.msecForCommonFinal);  // call static method
    const msec = this.msecForFinal;  // get our configured value
    await this.doFinal(msec);  // call non-static method
    console.log('Dep finished');
  }

  // custom methods

  static async doCommonFinal(msec) {  // static method
    await this.delay(msec);  // no `$` here as we're already in static scope
    console.log(`Dep common final in ${msec} msec`);
  }

  async doFinal(msec) {  // non-static method
    await this.$.delay(msec);  // `$` to use method from static scope
    console.log(`Dep final in ${msec} msec`);
  }
}

Dep.msecForInit = 1000;  // static values
Dep.msecForCommonFinal = 1000;

module.exports = Dep;
```

`index.js`
```js
const Clasync = require('clasync');
const Dep = require('./dep');

class Main extends Clasync {

  // framework handlers

  static async configure() {  // get default configuration for main module
    return {  // will be merged to main class instance
      dep: {msecForFinal: 1500}  // configuration for `Dep` instance
    };
  }  // presence of this static method makes this module launchable

  async init(deps) {  // initialization with dependencies
    await deps({
      $dep: Dep.sub(this.dep)  // declare dependency: `Dep` with configuration
    });

    console.log('App and all its dependencies are ready');
  }

  async final(reason) {
    console.log(`App finished. Reason: ${reason}`);
  }

  async main() {
    console.log('Main started');
    await this.$.delay(5000);
    console.log('Main finished');
    return 0;  // exit code (reason)
  }
}

Main.gracefulShutdownMsec = 6000;

module.exports = Main;

```
`node .`
```
Dep is ready in 1000 msec
App and all its dependencies are ready
Main started
Main finished
Dep common final in 1000 msec
Dep final in 1500 msec
Dep finished
App finished. Reason: 0
```
Launch again and after you see `Main started` press Ctrl+C:
```
Dep is ready in 1000 msec
App and all its dependencies are ready
Main started
^CDep common final in 1000 msec
Dep final in 1500 msec
Dep finished
App finished. Reason: SIGINT
Main finished
```
Note the `Reason: SIGINT` and still clean app shutdown.
Change `Main.gracefulShutdownMsec = 1500;` and launch again. Note app `CRITICAL` termination before finalizers complete:
```
Dep is ready in 1000 msec
App and all its dependencies are ready
Main started
Main finished
Dep common final in 1000 msec


--- CRITICAL --- 2018-09-07T08:51:06.097Z
Timed out waiting for finalizers
```
Completion of `Dep final` is beyond the graceful shutdown time period.
Launch again and after `Main started` press Ctrl+C twice. Application will terminate immediately.

## Async Events
`events.js`
```js
const ClasyncEmitter = require('../clasync/emitter');

class Main extends ClasyncEmitter {  // this class extends framework indirectly

  // framework handlers

  static async configure() {
    return {
      // no configuration
    };
  }

  async init() {
    this.on('start', async ({msec}) => {
      console.log('Main started');
      await this.$.delay(msec);
    }, 0);  // stage 0. no results from this stage

    this.on('start', async ({}) => {
      // results from same stage will be merged into one object
      return {stage1_handler1: 2};  // here is a stage 1 result
    }, 1);  // stage 1

    this.on('start', () => ({stage1_handler2: 2}), 1);  // also stage 1: sync handler
    this.on('start', async ({}) => undefined, 1);  // no result from this stage 1 async handler

    // event handler below won't be processed as non-empty result object
    //   is returned from previous stage
    this.on('start', () => ({stage2_handler1: 3}), 2);

    console.log('App and all its dependencies are ready');
  }

  async final(reason) {
    console.log(`App finished. Reason: ${reason}`);
  }

  async main() {
    const eventResults = await this.emit('start', {msec: 5000});
    console.log('Event result:', eventResults);
    console.log('Main finished');
    return 0;
  }
}

module.exports = Main;
```
`node events`
```
App and all its dependencies are ready
Main started
Event result: { stage1_handler1: 2, stage1_handler2: 2 }
Main finished
App finished. Reason: 0
```

## MOAR?
**Documentation in progress...** Hubs, promises, funtionals and much more...

## Thanks
[Staff.com](https://staff.com/)