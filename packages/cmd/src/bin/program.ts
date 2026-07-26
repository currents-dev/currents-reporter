import { Command } from '@commander-js/extra-typings';
import { reporterVersion } from '@env/versions';
import { getApiCommand } from '../commands/api';
import { getCacheCommand } from '../commands/cache';
import { getCancelCommand } from '../commands/cancel';
import { getUploadCommand } from '../commands/upload';
import { getConvertCommand } from '../commands/convert';

const example = `
----------------------------------------------------
📖 Documentation: https://docs.currents.dev
🤙 Support:       support@currents.dev
----------------------------------------------------
`;

const NAME = 'currents';
export const getProgram = () =>
  new Command(NAME)
    .version(reporterVersion)
    .description(`Currents CLI ${example}`)
    .addCommand(getUploadCommand(NAME), { isDefault: true })
    .addCommand(getCacheCommand(NAME))
    .addCommand(getApiCommand(NAME))
    .addCommand(getCancelCommand(NAME))
    .addCommand(getConvertCommand(NAME));
