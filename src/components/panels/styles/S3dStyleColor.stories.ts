import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dStyleColor from './S3dStyleColor.vue';

const meta = {
  title: 'Panels/Styles/StyleColor',
  component: S3dStyleColor,
  args: { field: 'edgeColor', label: 'Kanten' },
} satisfies Meta<typeof S3dStyleColor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Edges: Story = {};
export const Sky: Story = { args: { field: 'skyColor', label: 'Himmel' } };
