import type { AdminMasterSearchQuery } from './admin-search.schema.js';
import { AdminSearchRepository } from './admin-search.repository.js';

export class AdminSearchService {
  constructor(private readonly repo = new AdminSearchRepository()) {}

  search(query: AdminMasterSearchQuery) {
    return this.repo.search(query.q, query.limit);
  }
}
