import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { providePluginManagerState } from '../../../composables/usePluginManagerState';
import S3dInstalledPluginCard from './S3dInstalledPluginCard.vue';

/** the parts read the state of the plugin manager */
const withState: Decorator = (story) => ({ components: { story }, setup: () => providePluginManagerState(), template: '<story />' });

const meta = {
  title: 'Panels/Plugin manager/InstalledPluginCard',
  component: S3dInstalledPluginCard,
  decorators: [withState],
  args: {
    plugin: {
      id: 'demo',
      name: 'Demo-Plugin',
      version: '1.2.0',
      description: 'Zeigt, was ein Plugin kann.',
      author: 'Jemand',
      enabled: true,
      active: true,
      error: null,
    },
    canUpdate: false,
  },
} satisfies Meta<typeof S3dInstalledPluginCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};
export const Update: Story = { args: { canUpdate: true } };
export const Disabled: Story = {
  args: {
    plugin: {
      ...{
        id: 'demo',
        name: 'Demo-Plugin',
        version: '1.2.0',
        description: 'Zeigt, was ein Plugin kann.',
        author: 'Jemand',
        enabled: true,
        active: true,
        error: null,
      },
      enabled: false,
      active: false,
    },
  },
};
export const Error: Story = {
  args: {
    plugin: {
      ...{
        id: 'demo',
        name: 'Demo-Plugin',
        version: '1.2.0',
        description: 'Zeigt, was ein Plugin kann.',
        author: 'Jemand',
        enabled: true,
        active: true,
        error: null,
      },
      active: false,
      error: 'SyntaxError: Unexpected token',
    },
  },
};
export const Builtin: Story = {
  args: {
    plugin: {
      ...{
        id: 'demo',
        name: 'Demo-Plugin',
        version: '1.2.0',
        description: 'Zeigt, was ein Plugin kann.',
        author: 'Jemand',
        enabled: true,
        active: true,
        error: null,
      },
      builtin: true,
    },
  },
};
