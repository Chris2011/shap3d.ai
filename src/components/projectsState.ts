import { reactive } from 'vue';

/** the project overview (File › Projects…) is shown */
export const projectsState = reactive({ open: false });

export const openProjects = () => {
  projectsState.open = true;
};
export const closeProjects = () => {
  projectsState.open = false;
};
