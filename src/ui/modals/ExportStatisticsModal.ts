// src/ui/modals/ExportStatisticsModal.ts
// Wrapper class that bridges the Svelte ExportStatistics component with Obsidian's Modal API

import { App, Modal } from 'obsidian';
import { mount, unmount } from 'svelte';
import ExportStatistics from '../../components/ExportStatistics.svelte';
import type { ExportSizeReport } from '../../utils/exportSizeReport';

export class ExportStatisticsModal extends Modal {
  private report: ExportSizeReport;
  private component: ReturnType<typeof mount> | null = null;

  constructor(app: App, report: ExportSizeReport) {
    super(app);
    this.report = report;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Add scoped class for modal dimension overrides
    this.modalEl.addClass('advanced-html-export-modal');

    this.component = mount(ExportStatistics, {
      target: contentEl,
      props: {
        report: this.report,
        onClose: () => this.close(),
      },
    });
  }

  onClose(): void {
    if (this.component) {
      void unmount(this.component);
      this.component = null;
    }
    this.contentEl.empty();
  }
}
