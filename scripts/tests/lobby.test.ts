import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDirectory, freeSeats, type LobbyEntry } from '../../shared/lobby/directory.ts';
import QuickPlay, { type QuickPlayEvent } from '../../shared/lobby/quickPlay.ts';

const OFFER_MS = 150;

function entry(code: string, patch: Partial<LobbyEntry> = {}): LobbyEntry {
  return { code, hostId: `host-${code}`, isPublic: true, open: true, players: 1, maxPlayers: 8, trackName: 'Sunset Loop', updatedAt: Date.now(), reservations: {}, ...patch };
}

/** Collects a searcher's events and lets a test await the next one of a kind. */
function searcher(directory: MemoryDirectory, peerId: string) {
  const events: QuickPlayEvent[] = [];
  const waiters: { kind: QuickPlayEvent['kind']; resolve: (e: QuickPlayEvent) => void }[] = [];
  const quick = new QuickPlay(directory, peerId, (event) => {
    events.push(event);
    const waiter = waiters.find((w) => w.kind === event.kind);
    if (waiter) {
      waiters.splice(waiters.indexOf(waiter), 1);
      events.splice(events.indexOf(event), 1);
      waiter.resolve(event);
    }
  }, { offerMs: OFFER_MS });
  const next = (kind: QuickPlayEvent['kind']) =>
    new Promise<QuickPlayEvent>((resolve) => {
      const seen = events.find((e) => e.kind === kind);
      if (seen) {
        events.splice(events.indexOf(seen), 1);
        resolve(seen);
      } else waiters.push({ kind, resolve });
    });
  return { quick, next };
}

test('no open room: the searcher is told to host one', async () => {
  const directory = new MemoryDirectory();
  const { quick, next } = searcher(directory, 'p1');
  await quick.search();
  assert.equal((await next('host')).kind, 'host');
});

test('an open room is offered with a held seat; accepting returns the host to connect to', async () => {
  const directory = new MemoryDirectory();
  await directory.publish(entry('ROOM01', { maxPlayers: 2 }));
  const { quick, next } = searcher(directory, 'p1');
  await quick.search();
  const offer = await next('offer');
  assert.equal(offer.kind === 'offer' && offer.offer.code, 'ROOM01');
  assert.equal(freeSeats((await directory.get('ROOM01'))!, Date.now()), 0, 'the last seat is held for the offer');

  // A second searcher cannot take the held seat and is told to host instead.
  const other = searcher(directory, 'p2');
  await other.quick.search();
  assert.equal((await other.next('host')).kind, 'host');

  const target = quick.accept();
  assert.equal(target?.hostId, 'host-ROOM01');
});

test('a match not accepted in time lapses, frees the seat and stops the search', async () => {
  const directory = new MemoryDirectory();
  await directory.publish(entry('ROOM02', { maxPlayers: 2 }));
  const { quick, next } = searcher(directory, 'idle');
  await quick.search();
  await next('offer');
  assert.equal((await next('expired')).kind, 'expired');
  assert.equal(quick.accept(), null, 'a lapsed offer cannot be accepted');
  assert.equal(freeSeats((await directory.get('ROOM02'))!, Date.now()), 1, 'the seat went back to the pool');
});

test('stale, full, private and started rooms are never offered', async () => {
  const directory = new MemoryDirectory();
  await directory.publish(entry('STALE1', { updatedAt: Date.now() - 60_000 }));
  await directory.publish(entry('FULL01', { players: 8 }));
  await directory.publish(entry('PRIV01', { isPublic: false }));
  await directory.publish(entry('START1', { open: false }));
  const { quick, next } = searcher(directory, 'p1');
  await quick.search();
  assert.equal((await next('host')).kind, 'host');
});
