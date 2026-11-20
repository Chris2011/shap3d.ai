import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPhysicsTimeline from './S3dPhysicsTimeline.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Physics/PhysicsTimeline',
  component: S3dPhysicsTimeline,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dPhysicsTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
