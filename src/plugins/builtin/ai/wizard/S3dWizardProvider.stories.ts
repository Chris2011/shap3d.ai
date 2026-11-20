import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { Decorator } from '@storybook/vue3-vite';
import { provideAiSetup } from './useAiSetup';
import S3dWizardProvider from './S3dWizardProvider.vue';

/** the wizard steps read the wizard's state */
const withAiSetup: Decorator = (story) => ({ components: { story }, setup: () => provideAiSetup(), template: '<story />' });

const meta = {
  title: 'Plugins/AI/Setup/WizardProvider',
  component: S3dWizardProvider,
  decorators: [withAiSetup],
} satisfies Meta<typeof S3dWizardProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
