import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dBricks from './S3dBricks.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Bricks/Bricks',
  component: S3dBricks,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dBricks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
