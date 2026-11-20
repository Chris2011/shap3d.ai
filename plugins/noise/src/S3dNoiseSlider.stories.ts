import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dNoiseSlider from './S3dNoiseSlider.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Noise/NoiseSlider',
  component: S3dNoiseSlider,
  loaders: [startPluginPackage(plugin)],
  args: { label: 'Rauheit', modelValue: 40, min: 0, max: 100, step: 1 },
} satisfies Meta<typeof S3dNoiseSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
