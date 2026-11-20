import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dWizardSteps from './S3dWizardSteps.vue';

const meta = {
  title: 'Plugins/AI/Setup/WizardSteps',
  component: S3dWizardSteps,
  args: {
    labels: ['Anbieter', 'Verbindung', 'Modell', 'Fertig'],
    step: 1,
    done: (index: number) => index < 1,
    reachable: (index: number) => index <= 2,
  },
} satisfies Meta<typeof S3dWizardSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
