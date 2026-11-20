import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { providePluginManagerState } from '../../../composables/usePluginManagerState';
import S3dPluginExamples from './S3dPluginExamples.vue';

/** the parts read the state of the plugin manager */
const withState: Decorator = (story) => ({ components: { story }, setup: () => providePluginManagerState(), template: '<story />' });

const meta = {
  title: 'Panels/Plugin manager/PluginExamples',
  component: S3dPluginExamples,
  decorators: [withState],
} satisfies Meta<typeof S3dPluginExamples>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
