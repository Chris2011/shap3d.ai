// The commands of menus, palette and shortcuts – one module per job in ./commands/, this file keeps the registry.
import type { Editor } from './editor';
import { t, localized, shortcutLabel, hasMessage, localize } from '../i18n';
import type { Command, CommandDefinition } from './commands/types';
import { FILE_COMMANDS } from './commands/fileCommands';
import { EDIT_COMMANDS } from './commands/editCommands';
import { VIEW_COMMANDS } from './commands/viewCommands';
import { CAMERA_COMMANDS } from './commands/cameraCommands';

export type { Command } from './commands/types';
export * from './commands/files';
export * from './commands/modelToThree';
export * from './commands/importFile';
export * from './commands/groups';
export * from './commands/edit';
export * from './commands/faces';
export * from './commands/arrange';
export * from './commands/solids';
export * from './commands/view';

const COMMAND_LIST: CommandDefinition[] = [...FILE_COMMANDS, ...EDIT_COMMANDS, ...VIEW_COMMANDS, ...CAMERA_COMMANDS];

/** Label (`commands.<id>`) and shortcut follow the language. */
const localizeCommand = (definition: CommandDefinition): Command => {
  const shortcut = definition.shortcut;
  const command = localized(definition as Command, 'label', `commands.${definition.id}`);
  if (shortcut) {
    Object.defineProperty(command, 'shortcut', { get: () => shortcutLabel(shortcut), enumerable: true, configurable: true });
  }
  return command;
};

export const COMMANDS: Command[] = COMMAND_LIST.map(localizeCommand);

/** main-menu groups; plugins may still name the German ones */
export const GROUP_ALIASES: Record<string, string> = {
  Datei: 'file',
  Bearbeiten: 'edit',
  Ansicht: 'view',
  Kamera: 'camera',
  Volumenkörper: 'solids',
  Plugins: 'plugins',
};
/** shown name of a command group */
export const groupLabel = (group: string) => {
  const key = `groups.${GROUP_ALIASES[group] ?? group}`;
  return hasMessage(key) ? t(key) : localize(group);
};

export const findCommand = (id: string) => {
  return COMMANDS.find((command) => command.id === id);
};
export const runCommand = (editor: Editor, id: string) => {
  const command = findCommand(id);
  if (command && (!command.enabled || command.enabled(editor))) {
    command.run(editor);
  }
};
