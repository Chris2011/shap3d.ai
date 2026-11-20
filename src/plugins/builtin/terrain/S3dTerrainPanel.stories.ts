import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTerrainPanel from './S3dTerrainPanel.vue';

const meta = {
  title: 'Plugins/Terrain/TerrainPanel',
  component: S3dTerrainPanel,
} satisfies Meta<typeof S3dTerrainPanel>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
