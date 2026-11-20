import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPhysicsGuide from './S3dPhysicsGuide.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Physics/PhysicsGuide',
  component: S3dPhysicsGuide,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dPhysicsGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
