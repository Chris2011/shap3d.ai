import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { provideScriptEditorState } from '../../../composables/useScriptEditorState';
import S3dScriptToolbar from './S3dScriptToolbar.vue';

/** the parts read the state of the script editor */
const withState: Decorator = (story) => ({ components: { story }, setup: () => provideScriptEditorState(), template: '<story />' });

const meta = {
  title: 'Panels/Script editor/ScriptToolbar',
  component: S3dScriptToolbar,
  decorators: [withState],
} satisfies Meta<typeof S3dScriptToolbar>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
