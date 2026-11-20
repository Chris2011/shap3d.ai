import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dHfSearchBar from './S3dHfSearchBar.vue';

const meta = {
  title: 'Plugins/AI/Model search/HfSearchBar',
  component: S3dHfSearchBar,
  args: { query: 'qwen coder', sort: 'downloads', smallOnly: true },
} satisfies Meta<typeof S3dHfSearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
