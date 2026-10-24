import { randomBytes } from 'node:crypto';
import type { DriveInput } from '../shared/input.ts';
import type { ServerMessage } from '../shared/net/protocol.ts';
import type Room from './rooms/Room.ts';

export interface Transport {
  send(text: string): void;
  close(code?: number, reason?: string): void;
}

export interface QueuedInput {
  seq: number;
  tick: number;
  input: DriveInput;
  /** Server sim tick when the message arrived. */
  receivedTick?: number;
}

/** Inputs buffered beyond this are dropped: a client cannot bank inputs to "speed up". */
export const MAX_QUEUED_INPUTS = 8;
/** After a network burst the queue is trimmed to this so input latency does not stay inflated. */
export const TARGET_QUEUED_INPUTS = 4;

let nextPlayerId = 1;

export default class Player {
  readonly id = `p${nextPlayerId++}`;
  /** Secret for resuming after a disconnect. Sent once, never placed in a URL. */
  readonly token = randomBytes(24).toString('base64url');
  name: string;
  vehicleId: string;
  ready = false;
  room: Room | null = null;
  transport: Transport | null;
  disconnectedAt = -1;
  lastSeq = -1;
  ack = -1;
  readonly inputs: QueuedInput[] = [];

  constructor(transport: Transport, name: string, vehicleId: string) {
    this.transport = transport;
    this.name = name;
    this.vehicleId = vehicleId;
  }

  get connected(): boolean {
    return this.transport !== null;
  }

  send(message: ServerMessage): void {
    this.transport?.send(JSON.stringify(message));
  }

  sendRaw(text: string): void {
    this.transport?.send(text);
  }

  queueInputs(inputs: QueuedInput[], receivedTick: number): void {
    for (const entry of inputs) {
      if (entry.seq <= this.lastSeq) continue;
      this.lastSeq = entry.seq;
      this.inputs.push({ ...entry, receivedTick });
    }
    if (this.inputs.length > MAX_QUEUED_INPUTS) this.inputs.splice(0, this.inputs.length - MAX_QUEUED_INPUTS);
  }

  /** Next input to apply this tick; drops stale backlog so steering latency converges. */
  nextInput(): QueuedInput | undefined {
    if (this.inputs.length > TARGET_QUEUED_INPUTS) this.inputs.splice(0, this.inputs.length - TARGET_QUEUED_INPUTS);
    return this.inputs.shift();
  }

  resetRaceState(): void {
    this.inputs.length = 0;
    this.lastSeq = -1;
    this.ack = -1;
  }
}
