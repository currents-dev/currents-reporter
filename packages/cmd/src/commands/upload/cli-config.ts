import { debug as _debug } from "@debug";
import fs from "fs";
import { CLIOptions, cliOptionsToConfig, CurrentsConfig } from "../../config/upload";
import { createTempFile } from "./tmp-file";

const debug = _debug.extend("cli");

export class CLIManager {
  cliOptions: CLIOptions;
  parsedConfig: Partial<CurrentsConfig>;
  configFilePath: string | null = null;

  constructor(opts: CLIOptions) {
    this.cliOptions = opts;
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
