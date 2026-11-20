import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMaterialSwatch from './S3dMaterialSwatch.vue';

const meta = {
  title: 'Panels/Materials/MaterialSwatch',
  component: S3dMaterialSwatch,
  args: { material: { name: 'Holz', color: '#8a5a33', opacity: 1, roughness: 0.6, metalness: 0 }, cube: true, selected: false },
} satisfies Meta<typeof S3dMaterialSwatch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cube: Story = {};
export const Flat: Story = { args: { cube: false } };
export const Selected: Story = { args: { selected: true } };
