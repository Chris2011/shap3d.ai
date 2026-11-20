import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { useEditor } from '../keys';
import S3dOutlinerNode from './S3dOutlinerNode.vue';

const meta = {
  title: 'Panels/OutlinerNode',
  component: S3dOutlinerNode,
  args: { depth: 0, filter: '' } as any,
  render: (args) => ({
    components: { S3dOutlinerNode },
    setup: () => {
      // the first group of the demo model, with its sub-groups
      const editor = useEditor();
      const toNode = (inst: any, path: any[]): any => ({
        inst,
        path: [...path, inst],
        children: [...inst.definition.entities.instances.values()].map((child: any) => toNode(child, [...path, inst])),
      });
      const first = [...editor.model.root.instances.values()][0];
      return { args, node: first && toNode(first, []) };
    },
    template: '<ul v-if="node"><S3dOutlinerNode :node="node" :depth="args.depth" :filter="args.filter" /></ul>',
  }),
} satisfies Meta<typeof S3dOutlinerNode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
