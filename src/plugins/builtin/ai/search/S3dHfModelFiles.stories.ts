import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dHfModelFiles from './S3dHfModelFiles.vue';

const meta = {
  title: 'Plugins/AI/Model search/HfModelFiles',
  component: S3dHfModelFiles,
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
    detail: {
      quants: [
        {
          quant: 'Q4_K_M',
          file: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
          size: 4.68e9,
          ollamaName: 'hf.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M',
        },
        {
          quant: 'Q8_0',
          file: 'qwen2.5-coder-7b-instruct-q8_0.gguf',
          size: 8.1e9,
          ollamaName: 'hf.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF:Q8_0',
        },
      ],
      params: 7,
      context: 32768,
      arch: 'qwen2',
      split: 1,
    },
    loading: false,
    error: '',
    installed: new Set<string>(),
    canDownload: true,
  },
} satisfies Meta<typeof S3dHfModelFiles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Loading: Story = { args: { detail: null, loading: true } };
