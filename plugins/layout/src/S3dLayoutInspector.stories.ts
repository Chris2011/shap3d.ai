import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { loadDocument } from './document';
import { editor } from '../../../.storybook/editor';
import S3dLayoutInspector from './S3dLayoutInspector.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/LayOut/LayoutInspector',
  component: S3dLayoutInspector,
  loaders: [startPluginPackage(plugin)],
  args: {} as any, // the props come from render()
  render: () => ({
    components: { S3dLayoutInspector },
    setup: () => {
      const document = loadDocument();
      return { document, page: document.pages[0] ?? null, scenes: editor.model.scenes };
    },
    template: '<S3dLayoutInspector :document="document" :page="page" :selection="[]" :scenes="scenes" />',
  }),
} satisfies Meta<typeof S3dLayoutInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
