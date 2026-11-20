import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dSceneTabs from './S3dSceneTabs.vue';

const meta = {
  title: 'App/SceneTabs',
  component: S3dSceneTabs,
} satisfies Meta<typeof S3dSceneTabs>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
