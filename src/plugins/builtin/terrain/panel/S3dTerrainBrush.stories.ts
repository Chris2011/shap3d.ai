import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTerrainBrush from './S3dTerrainBrush.vue';

const meta = {
  title: 'Plugins/Terrain/Panel/TerrainBrush',
  component: S3dTerrainBrush,
} satisfies Meta<typeof S3dTerrainBrush>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
