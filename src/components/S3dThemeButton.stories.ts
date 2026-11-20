import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dThemeButton from './S3dThemeButton.vue';

const meta = {
  title: 'App/ThemeButton',
  component: S3dThemeButton,
} satisfies Meta<typeof S3dThemeButton>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
