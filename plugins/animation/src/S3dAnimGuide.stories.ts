import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimGuide from './S3dAnimGuide.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimGuide',
  component: S3dAnimGuide,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dAnimGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
