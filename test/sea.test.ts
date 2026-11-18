import assert from 'node:assert/strict';
import test from 'node:test';
import { Sea } from '../client/tide.ts';
test('a crest rolls right across every row, never onto the sand, and the sea calms down', () => {
  const s = new Sea(); s.size(60, 12);
  for (let i = 0; i < 6; i++) s.step(40, () => 1);
  for (let i = 0; i < 20; i++) s.step(40, () => 0);
  const row = (y: number) => [...s.now.slice(y * 60, y * 60 + 60)].map(Math.abs);
  for (const y of [0, 6, 11]) assert.ok(Math.max(...row(y).slice(10, 35)) > 0.05, `the front reached the middle on row ${y}`);
  for (let y = 0; y < 12; y++) for (let x = 40; x < 60; x++) assert.equal(s.now[y * 60 + x], 0);
  let e = 1; for (let i = 0; i < 1500; i++) e = s.step(40, () => 0);
  assert.ok(e < 1e-5, `calm after a while, got ${e}`);
  assert.ok(s.bytes.every(v => v >= 0 && v <= 255));
});
