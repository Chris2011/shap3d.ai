import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dRoomPlanner from './S3dRoomPlanner.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Room planner/RoomPlanner',
  component: S3dRoomPlanner,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dRoomPlanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
