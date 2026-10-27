import { freeSeats } from '../../../shared/lobby/directory.ts';

/**
 * Development stand-in for Firebase: tabs of one browser find each other through localStorage (the
 * directory) and a BroadcastChannel (the mailbox). Same contract as the Firebase backend; not for
 * production (no accounts, no cross-device play).
 */
const CHANNEL = 'nitro-clash-local-backend';
const DIRECTORY_KEY = 'nitro-clash:local-lobbies';
const PEER_KEY = 'nitro-clash:local-peer';

const readAll = () => {
  try {
    return JSON.parse(window.localStorage.getItem(DIRECTORY_KEY) ?? '{}');
  } catch {
    return {};
  }
};
const writeAll = (entries) => window.localStorage.setItem(DIRECTORY_KEY, JSON.stringify(entries));

function tabPeerId() {
  try {
    const stored = window.sessionStorage.getItem(PEER_KEY);
    if (stored) return stored;
    const id = `tab-${crypto.randomUUID().slice(0, 8)}`;
    window.sessionStorage.setItem(PEER_KEY, id);
    return id;
  } catch {
    return `tab-${crypto.randomUUID().slice(0, 8)}`;
  }
}

export function createLocalBackend() {
  const peerId = tabPeerId();
  const channel = new BroadcastChannel(CHANNEL);
  const handlers = new Set();
  channel.addEventListener('message', (event) => {
    const { to, from, payload } = event.data ?? {};
    if (to !== peerId) return;
    for (const handler of handlers) handler(from, payload);
  });

  const directory = {
    async get(code) {
      return readAll()[code] ?? null;
    },
    async listOpen() {
      return Object.values(readAll()).filter((e) => e.isPublic && e.open).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async publish(entry) {
      writeAll({ ...readAll(), [entry.code]: entry });
    },
    async update(code, patch) {
      const all = readAll();
      if (all[code]) writeAll({ ...all, [code]: { ...all[code], ...patch } });
    },
    async remove(code) {
      const { [code]: _gone, ...rest } = readAll();
      writeAll(rest);
    },
    async reserve(code, id, expiresAt, now) {
      const all = readAll();
      const entry = all[code];
      if (!entry || freeSeats(entry, now, id) <= 0) return false;
      writeAll({ ...all, [code]: { ...entry, reservations: { ...entry.reservations, [id]: expiresAt } } });
      return true;
    },
    async release(code, id) {
      const all = readAll();
      const entry = all[code];
      if (!entry) return;
      const { [id]: _dropped, ...reservations } = entry.reservations;
      writeAll({ ...all, [code]: { ...entry, reservations } });
    }
  };

  const mailbox = {
    send(to, payload) {
      channel.postMessage({ to, from: peerId, payload });
    },
    listen(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    }
  };

  return { kind: 'local', peerId, directory, mailbox, account: null };
}
