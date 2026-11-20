import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dBricksOnline from './S3dBricksOnline.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Bricks/BricksOnline',
  component: S3dBricksOnline,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dBricksOnline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
