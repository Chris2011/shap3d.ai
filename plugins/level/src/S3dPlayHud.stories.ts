import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPlayHud from './S3dPlayHud.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Level editor/PlayHud',
  component: S3dPlayHud,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dPlayHud>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
