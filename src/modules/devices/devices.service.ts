import { NotFoundError } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { DevicesRepository, type DeviceDto } from './devices.repository.js';
import type { RegisterDeviceInput } from './devices.schema.js';

export class DevicesService {
  constructor(private readonly repo = new DevicesRepository()) {}

  private async requireUserId(actorUuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(actorUuid);
    if (!id) throw new NotFoundError('User not found');
    return id;
  }

  async register(
    actorUuid: string,
    input: RegisterDeviceInput,
    ipAddress: string | null,
  ): Promise<DeviceDto> {
    const userId = await this.requireUserId(actorUuid);
    const device = await this.repo.upsertForUser(userId, input, ipAddress);

    logger.info(
      {
        userId: actorUuid,
        deviceId: input.deviceId,
        platform: input.platform,
        deviceModel: input.deviceModel ?? null,
        osVersion: input.osVersion ?? null,
        hasVoipToken: device.hasVoipToken,
        voipInRequest:
          typeof input.voipToken === 'string' && Boolean(input.voipToken.trim()),
      },
      'device register upsert complete',
    );

    if (input.platform === 'ios') {
      // Multi-iPhone: keep every PushKit row for this user CallKit-eligible.
      await this.repo.reactivateDevicesWithVoipToken(userId).catch(() => 0);
    }

    if (input.platform === 'ios' && !device.hasVoipToken) {
      logger.warn(
        {
          userId: actorUuid,
          deviceId: input.deviceId,
          deviceModel: input.deviceModel ?? null,
          osVersion: input.osVersion ?? null,
        },
        'iOS device registered without voipToken — CallKit will not ring when locked/killed; send PushKit token as voipToken',
      );
    }

    return device;
  }

  async list(actorUuid: string): Promise<DeviceDto[]> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.listActiveForUser(userId);
  }

  async unregister(actorUuid: string, deviceId: string): Promise<void> {
    const userId = await this.requireUserId(actorUuid);
    const ok = await this.repo.deactivateByDeviceId(userId, deviceId);
    if (!ok) {
      throw new NotFoundError('Device not found');
    }
  }
}
