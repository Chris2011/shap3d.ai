import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimRender from './S3dAnimRender.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimRender',
  component: S3dAnimRender,
  loaders: [startPluginPackage(plugin)],
  args: { advanced: false },
} satisfies Meta<typeof S3dAnimRender>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
export const Advanced: Story = { args: { advanced: true } };
