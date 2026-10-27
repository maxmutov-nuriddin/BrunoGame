/**
 * Shared plumbing for a WebRTC game link: two data channels (reliable/ordered for lobby and race setup,
 * unordered/no-retransmit for snapshots and inputs, where a late packet is worse than a lost one) and
 * chunking for big messages (the race setup carries the whole track).
 */
export const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
export const RELIABLE = 'reliable';
export const FAST = 'fast';
/** Below the 16 KiB every browser accepts per data-channel message. */
const CHUNK_CHARS = 15_000;
const CHUNK_MARK = '~';
/** Gathering normally finishes well within this; we send what we have after it. */
const ICE_GATHER_TIMEOUT_MS = 2500;

/** Messages that are superseded by the next one go on the fast channel. */
export const isFastMessage = (text) => text.startsWith('{"type":"snapshot"') || text.startsWith('{"type":"input"');

export function createChannels(pc) {
  return {
    [RELIABLE]: pc.createDataChannel(RELIABLE, { ordered: true }),
    [FAST]: pc.createDataChannel(FAST, { ordered: false, maxRetransmits: 0 })
  };
}

/** Wait until ICE candidates are gathered (no trickle: one offer and one answer through the mailbox). */
export function gatherIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const timer = setTimeout(done, ICE_GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/** Relay messages travel as database records; keep each well under the 100 000-character rule limit. */
export const RELAY_CHUNK_CHARS = 60_000;

let nextChunkId = 1;

/** `text` as one or more pieces of at most `size` characters, reassembled by createReceiver. */
export function splitMessage(text, size = CHUNK_CHARS) {
  if (text.length <= size) return [text];
  const id = nextChunkId++;
  const total = Math.ceil(text.length / size);
  return Array.from({ length: total }, (_, i) => `${CHUNK_MARK}${id}${CHUNK_MARK}${i}${CHUNK_MARK}${total}${CHUNK_MARK}${text.slice(i * size, (i + 1) * size)}`);
}

/** Send `text`, choosing the channel and splitting it when it is too big for one message. */
export function sendOver(channels, text) {
  const reliable = channels[RELIABLE];
  const fast = channels[FAST];
  if (text.length <= CHUNK_CHARS) {
    const channel = isFastMessage(text) && fast?.readyState === 'open' ? fast : reliable;
    if (channel?.readyState === 'open') channel.send(text);
    return;
  }
  if (reliable?.readyState !== 'open') return;
  for (const piece of splitMessage(text)) reliable.send(piece);
}

/** Reassembles chunked messages; calls `deliver` with each complete text. */
export function createReceiver(deliver) {
  const partial = new Map();
  return (data) => {
    if (typeof data !== 'string') return;
    if (!data.startsWith(CHUNK_MARK)) {
      deliver(data);
      return;
    }
    const [, id, index, total] = data.split(CHUNK_MARK, 4);
    const body = data.slice(id.length + index.length + total.length + 4);
    const parts = partial.get(id) ?? [];
    parts[Number(index)] = body;
    partial.set(id, parts);
    if (parts.filter((p) => p !== undefined).length === Number(total)) {
      partial.delete(id);
      deliver(parts.join(''));
    }
  };
}
