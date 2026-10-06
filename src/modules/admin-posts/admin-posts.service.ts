import { NotFoundError } from '../../shared/errors/index.js';
import type {
  AdminPostModerationBody,
  AdminPostReportActionBody,
  AdminPostReportsQuery,
  AdminPostsListQuery,
} from './admin-posts.schema.js';
import { AdminPostsRepository } from './admin-posts.repository.js';

export class AdminPostsService {
  constructor(private readonly repo = new AdminPostsRepository()) {}

  async overview(type: 'post' | 'reel' | 'vibe') {
    return { overview: await this.repo.overview(type) };
  }

  async list(query: AdminPostsListQuery) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const { rows, total } = await this.repo.list({
      page,
      limit,
      type: query.type,
      q: query.q,
      userQ: query.userQ,
      privacy: query.privacy,
      isDraft: query.isDraft,
      isArchived: query.isArchived,
      isPinned: query.isPinned,
      includeDeleted: query.includeDeleted,
      onlyDeleted: query.onlyDeleted,
      hashtag: query.hashtag,
      location: query.location,
      reported: query.reported,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    });
    return {
      posts: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getById(id: string) {
    const post = await this.repo.findByUuid(id);
    if (!post) throw new NotFoundError('Post not found');
    return { post };
  }

  async listReports(query: AdminPostReportsQuery) {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const { rows, total } = await this.repo.listReports({
      page,
      limit,
      type: query.type,
      status: query.status,
      q: query.q,
    });
    return {
      reports: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async updateReport(id: string, body: AdminPostReportActionBody) {
    const ok = await this.repo.updateReportStatus(id, body.status);
    if (!ok) throw new NotFoundError('Report not found');
    return { updated: true };
  }

  async softDelete(id: string) {
    const ok = await this.repo.softDelete(id);
    if (!ok) throw new NotFoundError('Post not found');
    return { deleted: true };
  }

  async moderate(id: string, body: AdminPostModerationBody) {
    const ok = await this.repo.moderate(id, body.action);
    if (!ok) throw new NotFoundError('Post not found');
    return { updated: true, action: body.action };
  }

  async listHashtags(opts: {
    type: 'post' | 'reel' | 'vibe';
    page: number;
    limit: number;
    q?: string;
  }) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const { rows, total } = await this.repo.listHashtags({
      ...opts,
      page,
      limit,
    });
    return {
      hashtags: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async listLocations(opts: {
    type: 'post' | 'reel' | 'vibe';
    page: number;
    limit: number;
    q?: string;
  }) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const { rows, total } = await this.repo.listLocations({
      ...opts,
      page,
      limit,
    });
    return {
      locations: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
