import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dCodeBlock from './S3dCodeBlock.vue';

const meta = {
  title: 'Plugins/AI/CodeBlock',
  component: S3dCodeBlock,
  args: { code: "s3d.material('Holz', '#8a5a33');\ns3d.box([0, 0, 0], 2, 1, 0.8, { name: 'Tisch', material: 'Holz' });", lang: 'js' },
} satisfies Meta<typeof S3dCodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Streaming: Story = { args: { streaming: true } };
export const Collapsed: Story = { args: { startCollapsed: true } };
