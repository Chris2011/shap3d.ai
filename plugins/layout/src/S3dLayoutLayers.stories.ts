import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { loadDocument, DEFAULT_LAYER_ID } from './document';
import S3dLayoutLayers from './S3dLayoutLayers.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/LayOut/LayoutLayers',
  component: S3dLayoutLayers,
  loaders: [startPluginPackage(plugin)],
  args: {} as any, // the props come from render()
  render: () => ({
    components: { S3dLayoutLayers },
    setup: () => ({ document: loadDocument(), active: DEFAULT_LAYER_ID }),
    template: '<S3dLayoutLayers :document="document" :active="active" />',
  }),
} satisfies Meta<typeof S3dLayoutLayers>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
