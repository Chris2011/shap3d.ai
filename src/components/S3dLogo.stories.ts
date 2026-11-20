import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dLogo from './S3dLogo.vue';

const meta = {
  title: 'App/Logo',
  component: S3dLogo,
  args: { size: 64 },
} satisfies Meta<typeof S3dLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const MarkOnly: Story = { args: { word: false } };
export const OnLight: Story = { args: { onLight: true } };
