import { Command } from '@commander-js/extra-typings';
import { formatExamples, HelpExample } from '../help';
import { commandHandler } from '../utils';
import { printDocs } from './docs';

const COMMAND_NAME = 'docs';

export const getDocsExamples = (name: string): HelpExample[] => [
  {
    comment: 'List the topics',
    commands: [`${name} ${COMMAND_NAME}`],
  },
  {
    comment: 'Print the guide to CI setup',
    commands: [`${name} ${COMMAND_NAME} ci-setup`],
  },
];

export const getDocsCommand = (name: string) =>
  new Command()
    .name(COMMAND_NAME)
    .summary('Print a guide, such as the CI setup steps')
    .description(
      'Print the guide of a topic as Markdown. Without a topic, list the topics.'
    )
    .argument('[topic]', 'the topic of the guide')
    .addHelpText('after', formatExamples(getDocsExamples(name)))
    .action(async (topic) => {
      await commandHandler(() => printDocs(name, topic), {});
    });
