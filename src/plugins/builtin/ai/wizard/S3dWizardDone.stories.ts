import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { Decorator } from '@storybook/vue3-vite';
import { provideAiSetup } from './useAiSetup';
import S3dWizardDone from './S3dWizardDone.vue';

/** the wizard steps read the wizard's state */
const withAiSetup: Decorator = (story) => ({ components: { story }, setup: () => provideAiSetup(), template: '<story />' });

const meta = {
  title: 'Plugins/AI/Setup/WizardDone',
  component: S3dWizardDone,
  decorators: [withAiSetup],
} satisfies Meta<typeof S3dWizardDone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
