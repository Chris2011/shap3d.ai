import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { provideScriptEditorState } from '../../../composables/useScriptEditorState';
import S3dScriptConsole from './S3dScriptConsole.vue';

/** the parts read the state of the script editor */
const withState: Decorator = (story) => ({ components: { story }, setup: () => provideScriptEditorState(), template: '<story />' });

const meta = {
  title: 'Panels/Script editor/ScriptConsole',
  component: S3dScriptConsole,
  decorators: [withState],
} satisfies Meta<typeof S3dScriptConsole>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
