import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_CHUNK_CHARS, createReceiver, isFastMessage, splitMessage } from '../../src/net/p2p/channels.js';

test('a race setup bigger than one message is split and reassembled exactly, in any arrival order', () => {
  const setup = JSON.stringify({ type: 'raceSetup', setup: { track: 'x'.repeat(428_000) } });
  const pieces = splitMessage(setup, RELAY_CHUNK_CHARS);
  assert.ok(pieces.length > 1);
  assert.ok(pieces.every((p) => p.length < 100_000), 'every piece fits the relay rule limit');
  const received: string[] = [];
  const receive = createReceiver((text: string) => received.push(text));
  for (const piece of [...pieces].reverse()) receive(piece);
  assert.deepEqual(received, [setup]);
});

test('small messages pass through untouched; two interleaved big messages both arrive', () => {
  const received: string[] = [];
  const receive = createReceiver((text: string) => received.push(text));
  const a = 'A'.repeat(40_000);
  const b = 'B'.repeat(40_000);
  const pa = splitMessage(a, 15_000);
  const pb = splitMessage(b, 15_000);
  receive('{"type":"pong"}');
  for (let i = 0; i < pa.length; i++) {
    receive(pa[i]);
    receive(pb[i]);
  }
  assert.deepEqual(received, ['{"type":"pong"}', a, b]);
});

test('snapshots and inputs take the fast channel; lobby and setup messages the reliable one', () => {
  assert.ok(isFastMessage(JSON.stringify({ type: 'snapshot', s: {} })));
  assert.ok(isFastMessage(JSON.stringify({ type: 'input', inputs: [] })));
  assert.ok(!isFastMessage(JSON.stringify({ type: 'room', code: 'ABCDEF' })));
  assert.ok(!isFastMessage(JSON.stringify({ type: 'raceSetup', setup: {} })));
});
