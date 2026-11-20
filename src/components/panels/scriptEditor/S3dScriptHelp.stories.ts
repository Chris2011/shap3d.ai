import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { provideScriptEditorState } from '../../../composables/useScriptEditorState';
import S3dScriptHelp from './S3dScriptHelp.vue';

/** the parts read the state of the script editor */
const withState: Decorator = (story) => ({ components: { story }, setup: () => provideScriptEditorState(), template: '<story />' });

const meta = {
  title: 'Panels/Script editor/ScriptHelp',
  component: S3dScriptHelp,
  decorators: [withState],
} satisfies Meta<typeof S3dScriptHelp>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
