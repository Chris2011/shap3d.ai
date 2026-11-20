import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dStyleCheck from './S3dStyleCheck.vue';

const meta = {
  title: 'Panels/Styles/StyleCheck',
  component: S3dStyleCheck,
  args: { field: 'edges' },
} satisfies Meta<typeof S3dStyleCheck>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Edges: Story = {};
export const AmbientOcclusion: Story = { args: { field: 'ao' } };
