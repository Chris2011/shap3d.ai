import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dAnimGraph from './S3dAnimGraph.vue';
import plugin from './index';
import { startPluginPackage } from '../../../.storybook/editor';

const meta = {
  title: 'Plugin packages/Animation/AnimGraph',
  component: S3dAnimGraph,
  loaders: [startPluginPackage(plugin)],
  args: {
    viewStart: 0,
    viewEnd: 48,
    channels: [
      {
        owner: 'demo',
        channel: 'z',
        label: 'Z',
        colour: '#3d7bd9',
        track: {
          keys: [
            { frame: 0, value: 0, interp: 'bezier' },
            { frame: 24, value: 2, interp: 'bezier' },
            { frame: 48, value: 0, interp: 'bezier' },
          ],
        },
      },
    ],
  } as any,
  decorators: [() => ({ template: '<div style="height: 320px"><story /></div>' })],
} satisfies Meta<typeof S3dAnimGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
