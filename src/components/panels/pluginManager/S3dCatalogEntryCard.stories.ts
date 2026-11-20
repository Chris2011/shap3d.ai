import type { Decorator, Meta, StoryObj } from '@storybook/vue3-vite';
import { providePluginManagerState } from '../../../composables/usePluginManagerState';
import S3dCatalogEntryCard from './S3dCatalogEntryCard.vue';

/** the parts read the state of the plugin manager */
const withState: Decorator = (story) => ({ components: { story }, setup: () => providePluginManagerState(), template: '<story />' });

const meta = {
  title: 'Panels/Plugin manager/CatalogEntryCard',
  component: S3dCatalogEntryCard,
  decorators: [withState],
  args: {
    entry: {
      id: 'layout',
      name: 'LayOut',
      version: '1.0.1',
      description: 'Pläne neben dem 3D-Modell: Blätter, Ansichtsfenster aus Szenen, Bemaßung und PDF.',
      license: 'Apache-2.0',
      author: 'Shap3D.ai',
      source: 'official' as const,
      installUrl: 'https://example.org/plugins/layout/',
      catalog: 'https://example.org/plugins/index.json',
      ownCatalog: false,
    },
  },
} satisfies Meta<typeof S3dCatalogEntryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Official: Story = {};
export const Community: Story = {
  args: {
    entry: {
      ...{
        id: 'layout',
        name: 'LayOut',
        version: '1.0.1',
        description: 'Pläne neben dem 3D-Modell: Blätter, Ansichtsfenster aus Szenen, Bemaßung und PDF.',
        license: 'Apache-2.0',
        author: 'Shap3D.ai',
        source: 'official' as const,
        installUrl: 'https://example.org/plugins/layout/',
        catalog: 'https://example.org/plugins/index.json',
        ownCatalog: false,
      },
      source: 'community',
      preview: true,
    },
  },
};
