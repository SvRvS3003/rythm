// TypeScript, client/tick.ts, web worker: a steady clock for the lock screen picture, since page timers slow down when the screen is off.
setInterval(() => postMessage(0), 33);
