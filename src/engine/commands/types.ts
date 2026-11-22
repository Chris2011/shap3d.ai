// What a command is.
import type { Editor } from '../editor';

/** group: 'file', 'edit', 'view', 'camera', 'solids', 'plugins' (main menu) or any other name (palette only) */
export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  group: string;
  icon?: string;
  keywords?: string;
  run: (editor: Editor) => void;
  enabled?: (editor: Editor) => boolean;
  checked?: (editor: Editor) => boolean;
  /** starts a new block in the main menu (a line above it) */
  separator?: boolean;
}
/** a command as written below – its label is the message `commands.<id>` */
export type CommandDefinition = Omit<Command, 'label'>;
