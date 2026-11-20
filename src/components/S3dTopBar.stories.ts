import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTopBar from './S3dTopBar.vue';

const meta = {
  title: 'App/TopBar',
  component: S3dTopBar,
} satisfies Meta<typeof S3dTopBar>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
