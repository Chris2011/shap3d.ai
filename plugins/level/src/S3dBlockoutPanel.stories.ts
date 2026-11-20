import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dBlockoutPanel from './S3dBlockoutPanel.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Level editor/BlockoutPanel',
  component: S3dBlockoutPanel,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dBlockoutPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
