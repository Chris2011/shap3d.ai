import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dLevelPanel from './S3dLevelPanel.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Level editor/LevelPanel',
  component: S3dLevelPanel,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dLevelPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
