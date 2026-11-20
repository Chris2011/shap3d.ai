import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimTimeline from './S3dAnimTimeline.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimTimeline',
  component: S3dAnimTimeline,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dAnimTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
