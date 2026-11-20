import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dToolButton from './S3dToolButton.vue';

const meta = {
  title: 'App/ToolButton',
  component: S3dToolButton,
  args: { tool: 'pushpull' },
} satisfies Meta<typeof S3dToolButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Select: Story = { args: { tool: 'select' } };
