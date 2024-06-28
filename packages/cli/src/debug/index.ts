import { debug as Debug, Debugger } from "debug";
import fs from "fs-extra";

export const debug = Debug("currents");

export function captureDebugToFile(
  traceFilePath: string,
  namespace: string,
  enabled: boolean
) {
  Debug.enable(namespace);
  const traceStream = fs.createWriteStream(traceFilePath, { flags: "a" });
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
