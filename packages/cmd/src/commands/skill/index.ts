import { Command, Option } from '@commander-js/extra-typings';
import { formatExamples, HelpExample } from '../help';
import { commandHandler } from '../utils';
import {
  DEFAULT_SKILLS_DIR,
  installSkill,
  printSkill,
  SKILL_NAME,
} from './skill';

const COMMAND_NAME = 'skill';

export const getSkillExamples = (name: string): HelpExample[] => [
  {
    comment: 'Print the skill',
    commands: [`${name} ${COMMAND_NAME}`],
  },
  {
    comment: `Add the skill to the project, in ${DEFAULT_SKILLS_DIR}/${SKILL_NAME}`,
    commands: [`${name} ${COMMAND_NAME} --install`],
  },
  {
    comment: 'Add the skill for Claude Code',
    commands: [`${name} ${COMMAND_NAME} --install --dir .claude/skills`],
  },
];

export const getSkillCommand = (name: string) =>
  new Command()
    .name(COMMAND_NAME)
    .summary('Print or install the agent skill for this CLI')
    .description(
      `Print SKILL.md of the ${SKILL_NAME} skill, which tells coding agents how to use this CLI, or install the skill in the project.

Agents read project skills from these folders:
  Codex, Cursor   ${DEFAULT_SKILLS_DIR}
  Claude Code     .claude/skills`
    )
    .addHelpText('after', formatExamples(getSkillExamples(name)))
    .addOption(
      new Option('--install', `write the skill folder to <dir>/${SKILL_NAME}`)
    )
    .addOption(
      new Option('--dir <path>', 'the skills folder to install to').default(
        DEFAULT_SKILLS_DIR
      )
    )
    .addOption(
      new Option(
        '--force',
        'replace an installed copy of the skill that differs from this version'
      )
    )
    .action(async (options) => {
      await commandHandler(async (opts) => {
        if (!opts.install && (opts.force || opts.dir !== DEFAULT_SKILLS_DIR)) {
          throw new Error('--dir and --force work with --install only');
        }
        if (opts.install) {
          await installSkill({ dir: opts.dir, force: opts.force });
        } else {
          await printSkill();
        }
      }, options);
    });
