import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPhysicsPanel from './S3dPhysicsPanel.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Physics/PhysicsPanel',
  component: S3dPhysicsPanel,
  loaders: [startPluginPackage(plugin)],
} satisfies Meta<typeof S3dPhysicsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
