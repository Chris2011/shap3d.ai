import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dHfResultRow from './S3dHfResultRow.vue';

const meta = {
  title: 'Plugins/AI/Model search/HfResultRow',
  component: S3dHfResultRow,
  args: {
    model: {
      id: 'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF',
      author: 'Qwen',
      downloads: 182000,
      likes: 640,
      updated: Date.parse('2026-11-20T10:00:00Z'),
      gated: false,
      tags: ['gguf', 'code'],
      license: 'apache-2.0',
      pipeline: 'text-generation',
      params: 7,
      active: null,
      chat: true,
      official: true,
    },
    open: false,
    installed: false,
  },
} satisfies Meta<typeof S3dHfResultRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Installed: Story = { args: { installed: true } };
