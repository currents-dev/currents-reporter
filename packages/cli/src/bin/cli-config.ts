import fs from "fs";
import { CLIOptions, CurrentsConfig, cliOptionsToConfig } from "../config";
import { debug as _debug } from "../debug";
import { getProgram, getCurrentsReporterCommand } from "./program";
import { createTempFile } from "./tmp-file";

const debug = _debug.extend("cli");

export type CurrentsProgram = ReturnType<typeof getProgram>;

export class CLIManager {
  program: CurrentsProgram;
  cliOptions: CLIOptions;
  parsedConfig: Partial<CurrentsConfig>;
  configFilePath: string | null = null;

  constructor() {
    this.program = getProgram(getCurrentsReporterCommand());

    this.cliOptions = this.program.parse().opts();
    debug("CLI options: %o", this.cliOptions);

    this.parsedConfig = cliOptionsToConfig(this.cliOptions);
    debug("Parsed config from CLI options: %o", this.parsedConfig);
  }

  async getConfigFilePath() {
    if (this.configFilePath) {
      return this.configFilePath;
    }
    const tempFilePath = await createTempFile();
    fs.writeFileSync(tempFilePath, JSON.stringify(this.parsedConfig));
    debug("CLI options temp file path: %s", tempFilePath);
    this.configFilePath = tempFilePath;
    return tempFilePath;
  }
}
