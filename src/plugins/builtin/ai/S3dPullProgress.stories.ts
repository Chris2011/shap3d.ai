import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPullProgress from './S3dPullProgress.vue';

const meta = {
  title: 'Plugins/AI/PullProgress',
  component: S3dPullProgress,
  args: {
    progress: { status: 'Lade herunter …', phase: 'download' as const, completed: 1.2e9, total: 4.7e9, frac: 0.26, speed: 2.4e7, eta: 146 },
  },
} satisfies Meta<typeof S3dPullProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Downloading: Story = {};
export const Error: Story = {
  args: {
    progress: {
      ...{ status: 'Lade herunter …', phase: 'download' as const, completed: 1.2e9, total: 4.7e9, frac: 0.26, speed: 2.4e7, eta: 146 },
      error: 'Verbindung zu Ollama verloren',
    },
  },
};
