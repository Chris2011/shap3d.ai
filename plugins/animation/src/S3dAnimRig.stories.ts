import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimRig from './S3dAnimRig.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimRig',
  component: S3dAnimRig,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dAnimRig>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
