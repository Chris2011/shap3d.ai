import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMaterialSurface from './S3dMaterialSurface.vue';

const meta = {
  title: 'Panels/Materials/MaterialSurface',
  component: S3dMaterialSurface,
  args: { material: { name: 'Holz', color: '#8a5a33', opacity: 1, roughness: 0.6, metalness: 0 }, shader: undefined },
} satisfies Meta<typeof S3dMaterialSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
