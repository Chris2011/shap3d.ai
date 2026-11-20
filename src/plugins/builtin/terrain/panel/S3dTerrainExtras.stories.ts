import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { DEFAULT_LAYERS } from '../terrainData';
import S3dTerrainExtras from './S3dTerrainExtras.vue';

const meta = {
  title: 'Plugins/Terrain/Panel/TerrainExtras',
  component: S3dTerrainExtras,
  args: {
    terrain: {
      width: 30,
      depth: 20,
      columns: 30,
      rows: 20,
      heights: new Array(31 * 21).fill(0),
      layers: { ...DEFAULT_LAYERS },
      skirt: true,
      water: null,
    },
  },
} satisfies Meta<typeof S3dTerrainExtras>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
