import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dLayerMixer from './S3dLayerMixer.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Shader materials/LayerMixer',
  component: S3dLayerMixer,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dLayerMixer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
