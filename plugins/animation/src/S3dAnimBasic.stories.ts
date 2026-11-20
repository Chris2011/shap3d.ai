import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimBasic from './S3dAnimBasic.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimBasic',
  component: S3dAnimBasic,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dAnimBasic>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
