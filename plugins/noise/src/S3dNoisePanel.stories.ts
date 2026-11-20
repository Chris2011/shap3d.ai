import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dNoisePanel from './S3dNoisePanel.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Noise/NoisePanel',
  component: S3dNoisePanel,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dNoisePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
