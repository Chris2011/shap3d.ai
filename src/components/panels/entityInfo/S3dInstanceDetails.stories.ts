import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dInstanceDetails from './S3dInstanceDetails.vue';

const meta = {
  title: 'Panels/Entity info/InstanceDetails',
  component: S3dInstanceDetails,
  args: {
    info: {
      kind: 'instance',
      title: 'Komponente',
      name: 'Stuhl links',
      defName: 'Stuhl',
      attributes: { Hersteller: 'Muster AG' },
      isComponent: true,
      count: 3,
      locked: false,
      pos: [9, 1, 0],
      size: '0,45 m × 0,45 m × 0,9 m',
      volume: '0,18 m³',
      material: 'Holz',
      matColor: '#8a5a33',
      hidden: false,
    },
  },
} satisfies Meta<typeof S3dInstanceDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
