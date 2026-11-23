import { onUnmounted } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dProjects from './S3dProjects.vue';
import { openProjects, closeProjects } from './projectsState';

const meta = {
  title: 'App/Projects',
  component: S3dProjects,
  parameters: { layout: 'fullscreen' },
  render: () => ({
    components: { S3dProjects },
    setup: () => {
      // shows the projects kept in this browser (Storybook has its own storage – often none)
      openProjects();
      onUnmounted(closeProjects);
    },
    template: '<S3dProjects />',
  }),
} satisfies Meta<typeof S3dProjects>;

export default meta;

export const Open: StoryObj<typeof meta> = {};
