import { ICE_SERVERS, RELAY_CHUNK_CHARS, RELIABLE, createChannels, createReceiver, gatherIce, sendOver, splitMessage } from './channels.js';

/** A direct link that has not opened by now is given up for the relay (strict NATs without TURN). */
const DIRECT_TIMEOUT_MS = 8000;
const RELAY_TIMEOUT_MS = 6000;

/**
 * A guest's link to a hosting browser, with the same shape NetClient uses for every link:
 * `send(text)`, `close()`, and `onmessage(text)` / `onclose()` callbacks. Direct WebRTC first; when that
 * cannot open (no TURN server by design), traffic goes through the backend mailbox instead (slower).
 */
export function dialHost(backend, hostId, code) {
  const sid = crypto.randomUUID();
  const link = { kind: 'connecting', onmessage: () => {}, onclose: () => {}, send: () => {}, close: () => {} };
  let closed = false;
  let pc = null;
  let stopListening = () => {};

  const finish = () => {
    if (closed) return;
    closed = true;
    stopListening();
    pc?.close();
    link.onclose();
  };
  link.close = () => {
    if (closed) return;
    backend.mailbox.send(hostId, { t: 'bye', sid });
    finish();
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const opened = (kind) => {
      if (settled) return;
      settled = true;
      link.kind = kind;
      resolve(link);
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      closed = true;
      stopListening();
      pc?.close();
      reject(new Error(message));
    };

    let relayRequested = false;
    const startRelay = () => {
      if (settled || closed || relayRequested) return;
      relayRequested = true;
      pc?.close();
      pc = null;
      backend.mailbox.send(hostId, { t: 'relay', sid, code });
      setTimeout(() => fail('Could not reach the host.'), RELAY_TIMEOUT_MS);
    };

    const receiveRelayed = createReceiver((text) => link.onmessage(text));
    stopListening = backend.mailbox.listen((from, mail) => {
      if (from !== hostId || mail?.sid !== sid) return;
      if (mail.t === 'answer' && pc) void pc.setRemoteDescription({ type: 'answer', sdp: mail.sdp }).catch(startRelay);
      else if (mail.t === 'relay-ok') {
        link.send = (text) => {
          for (const piece of splitMessage(text, RELAY_CHUNK_CHARS)) backend.mailbox.send(hostId, { t: 'r', sid, d: piece });
        };
        opened('relay');
      } else if (mail.t === 'r' && link.kind === 'relay' && typeof mail.d === 'string') receiveRelayed(mail.d);
      else if (mail.t === 'reject') fail(mail.reason ?? 'The host refused the connection.');
      else if (mail.t === 'bye') (settled ? finish() : fail('The host closed the room.'));
    });

    // Direct WebRTC attempt.
    try {
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    } catch {
      startRelay();
      return;
    }
    const channels = createChannels(pc);
    const receive = createReceiver((text) => link.onmessage(text));
    for (const channel of Object.values(channels)) channel.addEventListener('message', (event) => receive(event.data));
    channels[RELIABLE].addEventListener('open', () => {
      link.send = (text) => sendOver(channels, text);
      opened('direct');
    });
    channels[RELIABLE].addEventListener('close', () => link.kind === 'direct' && finish());
    pc.addEventListener('connectionstatechange', () => {
      if (link.kind === 'direct' && (pc?.connectionState === 'failed' || pc?.connectionState === 'closed')) finish();
    });
    setTimeout(() => link.kind === 'connecting' && startRelay(), DIRECT_TIMEOUT_MS);
    (async () => {
      await pc.setLocalDescription(await pc.createOffer());
      await gatherIce(pc);
      backend.mailbox.send(hostId, { t: 'offer', sid, code, sdp: pc.localDescription.sdp });
    })().catch(startRelay);
  });
}
