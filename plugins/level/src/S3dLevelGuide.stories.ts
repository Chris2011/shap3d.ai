import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dLevelGuide from './S3dLevelGuide.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Level editor/LevelGuide',
  component: S3dLevelGuide,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dLevelGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
