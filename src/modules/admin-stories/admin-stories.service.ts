import { NotFoundError } from '../../shared/errors/index.js';
import type { AdminStoriesListQuery } from './admin-stories.schema.js';
import { AdminStoriesRepository } from './admin-stories.repository.js';

export class AdminStoriesService {
  constructor(private readonly repo = new AdminStoriesRepository()) {}

  async list(query: AdminStoriesListQuery) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const { rows, total } = await this.repo.list({
      page,
      limit,
      state: query.state,
      q: query.q,
    });
    return {
      stories: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async softDelete(id: string) {
    const ok = await this.repo.softDelete(id);
    if (!ok) throw new NotFoundError('Story not found');
    return { deleted: true };
  }
}
