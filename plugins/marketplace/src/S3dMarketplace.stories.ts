import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMarketplace from './S3dMarketplace.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Marketplace/Marketplace',
  component: S3dMarketplace,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dMarketplace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
