import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { DEFAULT_LAYERS } from '../terrainData';
import S3dTerrainSurfaces from './S3dTerrainSurfaces.vue';

const meta = {
  title: 'Plugins/Terrain/Panel/TerrainSurfaces',
  component: S3dTerrainSurfaces,
  args: { layers: { ...DEFAULT_LAYERS } },
} satisfies Meta<typeof S3dTerrainSurfaces>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
