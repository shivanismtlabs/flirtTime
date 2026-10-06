import { NotFoundError } from '../../shared/errors/index.js';
import { FollowService } from '../follow/follow.service.js';
import { UserRepository } from '../user/user.repository.js';
import { ContactsRepository } from './contacts.repository.js';
import type {
  ContactMatchesPage,
  NormalizedContact,
  SyncContactsInput,
  SyncContactsResult,
} from './contacts.types.js';

const MATCHES_IN_SYNC_CAP = 50;
const MIN_PHONE_DIGITS = 6;
const MAX_PHONE_DIGITS = 15;

export class ContactsService {
  constructor(
    private readonly repo = new ContactsRepository(),
    private readonly users = new UserRepository(),
    private readonly follows = new FollowService(),
  ) {}

  private async resolveUserId(uuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(uuid);
    if (!id) throw new NotFoundError('User not found');
    return id;
  }

  /** Digits only — no country dial parsing. */
  private normalizePhone(raw: string): string | null {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length > 1) {
      digits = digits.slice(1);
    }
    if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
      return null;
    }
    return digits;
  }

  private normalizeIncoming(
    phones: string[],
    ownPhoneNumber: string | null,
  ): { normalized: NormalizedContact[]; skipped: number } {
    const seen = new Set<string>();
    const normalized: NormalizedContact[] = [];
    let skipped = 0;

    for (const raw of phones) {
      const phoneNumber = this.normalizePhone(raw);
      if (!phoneNumber) {
        skipped += 1;
        continue;
      }

      if (ownPhoneNumber && ownPhoneNumber === phoneNumber) {
        skipped += 1;
        continue;
      }

      if (seen.has(phoneNumber)) {
        skipped += 1;
        continue;
      }
      seen.add(phoneNumber);

      normalized.push({
        phoneNumber,
        displayName: null,
      });
    }

    return { normalized, skipped };
  }

  private async enrichProfiles(viewerUuid: string, internalIds: string[]) {
    if (!internalIds.length) return [];
    const rows = await this.users.findProfilesByInternalIds(internalIds);
    const relMap = await this.follows.relationshipsForTargets(
      viewerUuid,
      rows.map((u) => u.id),
    );
    return rows.map((u) => ({
      ...u,
      relationship: relMap.get(u.id) ?? {
        isFollowing: false,
        isFollowedBy: false,
        isRequestedByMe: false,
        isRequestedToMe: false,
        isBlocked: false,
        blockedByOwner: false,
        isSelf: u.id === viewerUuid,
      },
    }));
  }

  async sync(viewerUuid: string, input: SyncContactsInput): Promise<SyncContactsResult> {
    const userId = await this.resolveUserId(viewerUuid);
    const ownPhone = await this.repo.findUserPhone(userId);
    const ownPhoneNumber = ownPhone?.phoneNumber
      ? this.normalizePhone(ownPhone.phoneNumber)
      : null;

    const { normalized, skipped } = this.normalizeIncoming(
      input.contacts,
      ownPhoneNumber,
    );

    if (input.replace) {
      await this.repo.softDeleteMissing(userId, normalized);
    }

    const uploaded = await this.repo.upsertContacts(userId, normalized);

    const { ids, total } = await this.repo.findMatchedUserIds(
      userId,
      MATCHES_IN_SYNC_CAP,
      0,
    );
    const matches = await this.enrichProfiles(viewerUuid, ids);

    return {
      uploaded,
      matched: total,
      skipped,
      matches,
    };
  }

  async matches(
    viewerUuid: string,
    page: number,
    limit: number,
  ): Promise<ContactMatchesPage> {
    const userId = await this.resolveUserId(viewerUuid);
    const offset = (page - 1) * limit;
    const { ids, total } = await this.repo.findMatchedUserIds(userId, limit, offset);
    const rows = await this.enrichProfiles(viewerUuid, ids);
    return { rows, total };
  }
}
