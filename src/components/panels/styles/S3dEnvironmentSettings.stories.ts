import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dEnvironmentSettings from './S3dEnvironmentSettings.vue';

const meta = {
  title: 'Panels/Styles/EnvironmentSettings',
  component: S3dEnvironmentSettings,
} satisfies Meta<typeof S3dEnvironmentSettings>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
