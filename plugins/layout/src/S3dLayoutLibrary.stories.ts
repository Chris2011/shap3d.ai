import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dLayoutLibrary from './S3dLayoutLibrary.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/LayOut/LayoutLibrary',
  component: S3dLayoutLibrary,
  loaders: [startPluginPackage(plugin)],
  args: { active: null },
} satisfies Meta<typeof S3dLayoutLibrary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
