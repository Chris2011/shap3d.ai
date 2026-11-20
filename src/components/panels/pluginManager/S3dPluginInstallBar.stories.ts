import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { providePluginManagerState } from '../../../composables/usePluginManagerState';
import S3dPluginInstallBar from './S3dPluginInstallBar.vue';

/** the parts read the state of the plugin manager */
const withState: Decorator = (story) => ({ components: { story }, setup: () => providePluginManagerState(), template: '<story />' });

const meta = {
  title: 'Panels/Plugin manager/PluginInstallBar',
  component: S3dPluginInstallBar,
  decorators: [withState],
  args: { updatable: false },
} satisfies Meta<typeof S3dPluginInstallBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Updatable: Story = { args: { updatable: true } };
