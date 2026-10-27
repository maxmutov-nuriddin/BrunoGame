let scale = 1;
const origin = performance.now();

/** Server time in ms. Tests may speed it up; production always runs at scale 1. */
export function now(): number {
  return (performance.now() - origin) * scale;
}

export function setTimeScale(value: number): void {
  scale = value;
}
