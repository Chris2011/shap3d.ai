import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dStyles from './S3dStyles.vue';

const meta = {
  title: 'Panels/Styles',
  component: S3dStyles,
} satisfies Meta<typeof S3dStyles>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
