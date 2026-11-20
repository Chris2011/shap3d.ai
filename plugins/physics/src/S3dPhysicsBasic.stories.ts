import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPhysicsBasic from './S3dPhysicsBasic.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Physics/PhysicsBasic',
  component: S3dPhysicsBasic,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dPhysicsBasic>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
