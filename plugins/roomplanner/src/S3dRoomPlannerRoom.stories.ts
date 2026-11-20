import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { DEFAULT_ROOM } from './room';
import S3dRoomPlannerRoom from './S3dRoomPlannerRoom.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Room planner/RoomPlannerRoom',
  component: S3dRoomPlannerRoom,
  loaders: [startPluginPackage(plugin)],
  args: { draft: structuredClone(DEFAULT_ROOM), level: 0, stair: null, origin: [0, 0] },
} satisfies Meta<typeof S3dRoomPlannerRoom>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
