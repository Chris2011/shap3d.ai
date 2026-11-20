import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dIcon from './S3dIcon.vue';

const meta = {
  title: 'App/Icon',
  component: S3dIcon,
  args: { name: 'pushpull', size: 48 },
} satisfies Meta<typeof S3dIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Small: Story = { args: { name: 'move', size: 18 } };
