import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dBricksModels from './S3dBricksModels.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Bricks/BricksModels',
  component: S3dBricksModels,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dBricksModels>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
