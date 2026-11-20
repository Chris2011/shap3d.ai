import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTerrainChooser from './S3dTerrainChooser.vue';

const meta = {
  title: 'Plugins/Terrain/Panel/TerrainChooser',
  component: S3dTerrainChooser,
} satisfies Meta<typeof S3dTerrainChooser>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
