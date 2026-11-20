import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dCloseButton from './S3dCloseButton.vue';

const meta = {
  title: 'UI/CloseButton',
  component: S3dCloseButton,
  args: { title: 'Schließen', size: 'md' },
} satisfies Meta<typeof S3dCloseButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {};
export const Small: Story = { args: { size: 'sm' } };
