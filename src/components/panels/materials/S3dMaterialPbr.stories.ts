import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMaterialPbr from './S3dMaterialPbr.vue';

const meta = {
  title: 'Panels/Materials/MaterialPbr',
  component: S3dMaterialPbr,
  args: { material: { name: 'Holz', color: '#8a5a33', opacity: 1, roughness: 0.6, metalness: 0 } },
} satisfies Meta<typeof S3dMaterialPbr>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
