// Types for channels.js (plain JS in the browser bundle, imported by the TypeScript tests).
export const ICE_SERVERS: RTCIceServer[];
export const RELIABLE: 'reliable';
export const FAST: 'fast';
export const RELAY_CHUNK_CHARS: number;
export function isFastMessage(text: string): boolean;
export function createChannels(pc: RTCPeerConnection): Record<'reliable' | 'fast', RTCDataChannel>;
export function gatherIce(pc: RTCPeerConnection): Promise<void>;
export function splitMessage(text: string, size?: number): string[];
export function sendOver(channels: Partial<Record<'reliable' | 'fast', RTCDataChannel>>, text: string): void;
export function createReceiver(deliver: (text: string) => void): (data: unknown) => void;
