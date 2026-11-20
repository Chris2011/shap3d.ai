import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dContextMenu from './S3dContextMenu.vue';

const meta = {
  title: 'App/ContextMenu',
  component: S3dContextMenu,
  args: { x: 24, y: 24 },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof S3dContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
