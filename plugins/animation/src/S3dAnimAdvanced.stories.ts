import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimAdvanced from './S3dAnimAdvanced.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimAdvanced',
  component: S3dAnimAdvanced,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dAnimAdvanced>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
