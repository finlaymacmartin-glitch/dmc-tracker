// First page = Insights: the business numbers, front and center.
// (The action-y stuff lives in Schedule/Money; content is shared with Money › Insights.)

import { renderInsights } from './invoices.js';

export async function renderDashboard(root, data) {
  renderInsights(root, data);
}
