import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMaterialBasics from './S3dMaterialBasics.vue';

const meta = {
  title: 'Panels/Materials/MaterialBasics',
  component: S3dMaterialBasics,
  args: { material: { name: 'Holz', color: '#8a5a33', opacity: 1, roughness: 0.6, metalness: 0 } },
} satisfies Meta<typeof S3dMaterialBasics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
