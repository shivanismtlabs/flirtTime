import type { DashboardOverviewQuery } from './admin-dashboard.schema.js';
import { AdminDashboardRepository } from './admin-dashboard.repository.js';
import type { DashboardOverview } from './admin-dashboard.types.js';

export class AdminDashboardService {
  constructor(private readonly repo = new AdminDashboardRepository()) {}

  overview(query: DashboardOverviewQuery): Promise<DashboardOverview> {
    return this.repo.getOverview({
      range: query.range,
      gender: query.gender,
      contentType: query.contentType,
      verified: query.verified,
    });
  }
}
