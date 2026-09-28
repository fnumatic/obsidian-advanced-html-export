/**
 * Yields control back to the browser so pending UI updates can run between
 * chunks of synchronous work.
 * @returns A promise that resolves on the next macrotask
 */
export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
