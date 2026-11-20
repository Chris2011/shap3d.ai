import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPluginManager from './S3dPluginManager.vue';

const meta = {
  title: 'Panels/PluginManager',
  component: S3dPluginManager,
} satisfies Meta<typeof S3dPluginManager>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
