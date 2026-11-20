import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMaterialSlot from './S3dMaterialSlot.vue';

const meta = {
  title: 'Panels/Entity info/MaterialSlot',
  component: S3dMaterialSlot,
  args: { label: 'Vorderseite', material: 'Holz', color: '#8a5a33' },
} satisfies Meta<typeof S3dMaterialSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Default: Story = { args: { material: undefined, color: '#ffffff' } };
