import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dInstructor from './S3dInstructor.vue';

const meta = {
  title: 'Panels/Instructor',
  component: S3dInstructor,
} satisfies Meta<typeof S3dInstructor>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
