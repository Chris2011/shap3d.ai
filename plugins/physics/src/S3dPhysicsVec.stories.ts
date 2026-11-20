import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPhysicsVec from './S3dPhysicsVec.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Physics/PhysicsVec',
  component: S3dPhysicsVec,
  loaders: [startPluginPackage(plugin)],
  args: { label: 'Schwerkraft', modelValue: [0, 0, -9.81] },
} satisfies Meta<typeof S3dPhysicsVec>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
