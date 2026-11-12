import { App } from 'obsidian';
import type { ExportSizeReport } from '../../utils/exportSizeReport';
import type { ModalView } from '../view';
import { createExportStatisticsView } from '../views/export-statistics-view';
import { ViewModal } from './ViewModal';

export class ExportStatisticsModal extends ViewModal<void> {
  private report: ExportSizeReport;

  constructor(app: App, report: ExportSizeReport) {
    super(app);
    this.report = report;
  }

  protected createView(target: HTMLElement): ModalView {
    return createExportStatisticsView(target, {
      report: this.report,
      onClose: () => this.finish(),
    });
  }

  protected getFallbackResult(): void {
    // The statistics modal has no result to resolve.
  }
}
