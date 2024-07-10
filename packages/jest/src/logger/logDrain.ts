let logDrain: string[] = [];

export function getLogDrain() {
  return logDrain;
}

export function addToLogDrain(str: string) {
  logDrain.push(str);
}
