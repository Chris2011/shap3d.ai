import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dLayoutWorkspace from './S3dLayoutWorkspace.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/LayOut/LayoutWorkspace',
  component: S3dLayoutWorkspace,
  loaders: [startPluginPackage(plugin)],
  parameters: { layout: 'fullscreen' },
  decorators: [() => ({ template: '<div style="height: 640px; display: flex"><story /></div>' })],
} satisfies Meta<typeof S3dLayoutWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
