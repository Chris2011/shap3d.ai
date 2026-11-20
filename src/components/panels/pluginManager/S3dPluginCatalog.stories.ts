import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { providePluginManagerState } from '../../../composables/usePluginManagerState';
import S3dPluginCatalog from './S3dPluginCatalog.vue';

/** the parts read the state of the plugin manager */
const withState: Decorator = (story) => ({ components: { story }, setup: () => providePluginManagerState(), template: '<story />' });

const meta = {
  title: 'Panels/Plugin manager/PluginCatalog',
  component: S3dPluginCatalog,
  decorators: [withState],
} satisfies Meta<typeof S3dPluginCatalog>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
