import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { provideScriptEditorState } from '../../../composables/useScriptEditorState';
import S3dCodeArea from './S3dCodeArea.vue';

/** the parts read the state of the script editor */
const withState: Decorator = (story) => ({ components: { story }, setup: () => provideScriptEditorState(), template: '<story />' });

const meta = {
  title: 'Panels/Script editor/CodeArea',
  component: S3dCodeArea,
  decorators: [withState],
} satisfies Meta<typeof S3dCodeArea>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
