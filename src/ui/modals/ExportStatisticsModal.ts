// src/ui/modals/ExportStatisticsModal.ts
// Wrapper class that bridges the Svelte ExportStatistics component with Obsidian's Modal API

import { App } from 'obsidian';
import { mount } from 'svelte';
import ExportStatistics from '../../components/ExportStatistics.svelte';
import type { ExportSizeReport } from '../../utils/exportSizeReport';
import { SvelteModal } from './SvelteModal';

export class ExportStatisticsModal extends SvelteModal<void> {
  private report: ExportSizeReport;

  constructor(app: App, report: ExportSizeReport) {
    super(app);
    this.report = report;
  }

  protected mountComponent(target: HTMLElement): ReturnType<typeof mount> {
    return mount(ExportStatistics, {
      target,
      props: {
        report: this.report,
        onClose: () => this.finish(),
      },
    });
  }

  protected getFallbackResult(): void {
    // The statistics modal has no result to resolve.
  }
}
