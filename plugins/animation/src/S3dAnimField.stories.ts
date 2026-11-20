import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimField from './S3dAnimField.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimField',
  component: S3dAnimField,
  loaders: [startPluginPackage(plugin)],
  args: { label: 'X', value: 1.25, status: 'keyed', type: 'number', step: 0.1, digits: 2 },
} satisfies Meta<typeof S3dAnimField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Keyed: Story = {};
export const Animated: Story = { args: { status: 'animated' } };
export const Colour: Story = { args: { label: 'Farbe', value: '#3d7bd9', type: 'color', status: 'none' } };
