import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMainMenu from './S3dMainMenu.vue';

const meta = {
  title: 'App/MainMenu',
  component: S3dMainMenu,
} satisfies Meta<typeof S3dMainMenu>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
