import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { provideScriptEditorState } from '../../../composables/useScriptEditorState';
import S3dObjOptions from './S3dObjOptions.vue';

/** the parts read the state of the script editor */
const withState: Decorator = (story) => ({ components: { story }, setup: () => provideScriptEditorState(), template: '<story />' });

const meta = {
  title: 'Panels/Script editor/ObjOptions',
  component: S3dObjOptions,
  decorators: [withState],
} satisfies Meta<typeof S3dObjOptions>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
