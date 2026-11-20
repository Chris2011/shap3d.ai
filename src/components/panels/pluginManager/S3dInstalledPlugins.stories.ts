import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { providePluginManagerState } from '../../../composables/usePluginManagerState';
import S3dInstalledPlugins from './S3dInstalledPlugins.vue';

/** the parts read the state of the plugin manager */
const withState: Decorator = (story) => ({ components: { story }, setup: () => providePluginManagerState(), template: '<story />' });

const meta = {
  title: 'Panels/Plugin manager/InstalledPlugins',
  component: S3dInstalledPlugins,
  decorators: [withState],
  args: { canUpdate: () => false },
} satisfies Meta<typeof S3dInstalledPlugins>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
