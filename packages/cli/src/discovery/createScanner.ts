import { ReportConfig } from "../types";
import { JestScanner } from "./jest";
import { Scanner } from "./scanner";

export function createScanner(config: ReportConfig): Scanner {
  switch (config.framework) {
    case "jest":
      return new JestScanner(config);

    default:
      return new Scanner(config);
  }
}
