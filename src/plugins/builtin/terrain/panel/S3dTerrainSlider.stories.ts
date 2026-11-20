import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTerrainSlider from './S3dTerrainSlider.vue';

const meta = {
  title: 'Plugins/Terrain/Panel/TerrainSlider',
  component: S3dTerrainSlider,
  args: { label: 'Radius', modelValue: 3, min: 0.5, max: 20, step: 0.5, valueText: '3,0 m', disabled: false },
} satisfies Meta<typeof S3dTerrainSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Disabled: Story = { args: { disabled: true } };
