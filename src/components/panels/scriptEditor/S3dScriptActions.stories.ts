import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { provideScriptEditorState } from '../../../composables/useScriptEditorState';
import S3dScriptActions from './S3dScriptActions.vue';

/** the parts read the state of the script editor */
const withState: Decorator = (story) => ({ components: { story }, setup: () => provideScriptEditorState(), template: '<story />' });

const meta = {
  title: 'Panels/Script editor/ScriptActions',
  component: S3dScriptActions,
  decorators: [withState],
} satisfies Meta<typeof S3dScriptActions>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
