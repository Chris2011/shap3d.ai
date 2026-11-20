import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dOcclusionStyles from './S3dOcclusionStyles.vue';

const meta = {
  title: 'Panels/Styles/OcclusionStyles',
  component: S3dOcclusionStyles,
} satisfies Meta<typeof S3dOcclusionStyles>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
