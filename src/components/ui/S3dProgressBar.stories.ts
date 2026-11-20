import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dProgressBar from './S3dProgressBar.vue';

const meta = {
  title: 'UI/ProgressBar',
  component: S3dProgressBar,
  args: { value: 0.42, labeled: false },
} satisfies Meta<typeof S3dProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Labeled: Story = { args: { labeled: true } };
