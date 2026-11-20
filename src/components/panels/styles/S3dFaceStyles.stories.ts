import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dFaceStyles from './S3dFaceStyles.vue';

const meta = {
  title: 'Panels/Styles/FaceStyles',
  component: S3dFaceStyles,
} satisfies Meta<typeof S3dFaceStyles>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
