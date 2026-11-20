import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPaletteFooter from './S3dPaletteFooter.vue';

const meta = {
  title: 'Command palette/PaletteFooter',
  component: S3dPaletteFooter,
  args: { prefix: '>' },
} satisfies Meta<typeof S3dPaletteFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Commands: Story = {};
export const Objects: Story = { args: { prefix: '@' } };
export const All: Story = { args: { prefix: '' } };
