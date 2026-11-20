import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimRendering from './S3dAnimRendering.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimRendering',
  component: S3dAnimRendering,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dAnimRendering>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
