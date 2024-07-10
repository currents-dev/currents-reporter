import { debug as Debug, Debugger } from "debug";
import fs from "fs-extra";

export const debug = Debug("currents");

let _traceFilePath: string | null = null;

export function enableDebug() {
  Debug.enable("currents,currents:*");
}

export function setTraceFilePath(path: string) {
  _traceFilePath = path;
}

export function captureDebugToFile(debugInstance: Debugger) {
  if (!_traceFilePath) {
    throw new Error("Trace file path is not set!");
  }

  const { namespace, enabled } = debugInstance;

  Debug.enable(namespace);

  const traceStream = fs.createWriteStream(_traceFilePath, { flags: "a" });
  const originalLog = Debug.log;

  Debug.log = (...args: any[]) => {
    const message = args.map(String).join(" ") + "\n";
    traceStream.write(`[${new Date().toISOString()}]${message}}`);
    if (enabled) {
      originalLog.apply(Debug, args);
    }
  };

  process.on("exit", () => {
    traceStream.end();
  });

  return Debug(namespace);
}
