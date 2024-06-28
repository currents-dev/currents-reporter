import { ReportConfig } from "../types";
import { FullTestSuite } from "./types";

export class Scanner {
  constructor(protected config: ReportConfig) {}
  async getFullTestSuite(): Promise<FullTestSuite> {
    return [];
  }
}
