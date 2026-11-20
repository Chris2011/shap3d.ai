import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { CATALOG } from './catalog';
import S3dRoomPlannerParams from './S3dRoomPlannerParams.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Room planner/RoomPlannerParams',
  component: S3dRoomPlannerParams,
  loaders: [startPluginPackage(plugin)],
  args: {} as any, // the props come from render()
  render: () => ({
    components: { S3dRoomPlannerParams },
    setup: () => ({ item: CATALOG[0], params: { ...CATALOG[0].defaults } }),
    template: '<S3dRoomPlannerParams :item="item" :params="params" />',
  }),
} satisfies Meta<typeof S3dRoomPlannerParams>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
