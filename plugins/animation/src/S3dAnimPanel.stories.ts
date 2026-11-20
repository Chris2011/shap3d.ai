import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimPanel from './S3dAnimPanel.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimPanel',
  component: S3dAnimPanel,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dAnimPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
