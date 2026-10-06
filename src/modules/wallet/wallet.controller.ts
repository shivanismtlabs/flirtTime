import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  AdminAdjustInput,
  AdminDepositsListQuery,
  AdminProcessWithdrawInput,
  AdminTransactionsListQuery,
  AdminUpdatePaymentSettingsInput,
  AdminWalletsListQuery,
  SendCoinsInput,
  VerifyPurchaseInput,
  WithdrawInput,
} from './wallet.schema.js';
import { WalletService } from './wallet.service.js';

export class WalletController {
  constructor(private readonly service = new WalletService()) {}

  getWallet = async (request: FastifyRequest, reply: FastifyReply) => {
    const wallet = await this.service.getWallet(request.user!.sub);
    return reply.send({ wallet });
  };

  listTransactions = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page: number;
      limit: number;
      bucket?: 'available' | 'earned';
      type?:
        | 'topup'
        | 'send'
        | 'receive'
        | 'earn'
        | 'withdraw'
        | 'spend'
        | 'adjust';
      types?: Array<
        | 'topup'
        | 'send'
        | 'receive'
        | 'earn'
        | 'withdraw'
        | 'spend'
        | 'adjust'
      >;
      from?: string;
      to?: string;
    };
    const data = await this.service.listTransactions(request.user!.sub, query);
    return reply.send(data);
  };

  getWithdrawSettings = async (_request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getWithdrawSettings();
    return reply.send({ settings });
  };

  previewFee = async (request: FastifyRequest, reply: FastifyReply) => {
    const { amount, payoutMethod } = request.query as {
      amount: number;
      payoutMethod: 'bank' | 'paypal' | 'crypto';
    };
    const data = await this.service.previewWithdrawFee(amount, payoutMethod);
    return reply.send(data);
  };

  sendCoins = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as SendCoinsInput;
    const data = await this.service.sendCoins(request.user!.sub, body);
    return reply.send(data);
  };

  withdraw = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as WithdrawInput;
    const data = await this.service.requestWithdraw(request.user!.sub, body);
    return reply.code(201).send(data);
  };

  listMyWithdrawals = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page: number;
      limit: number;
      status?: string;
    };
    const data = await this.service.listMyWithdrawals(request.user!.sub, query);
    return reply.send(data);
  };

  verifyPurchase = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as VerifyPurchaseInput;
    const data = await this.service.verifyPurchase(request.user!.sub, body);
    return reply.code(201).send(data);
  };

  // Admin
  adminGetSettings = async (_request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getWithdrawSettings();
    return reply.send({ settings });
  };

  adminUpdateSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AdminUpdatePaymentSettingsInput;
    const settings = await this.service.adminUpdateWithdrawSettings(
      request.user!.sub,
      body,
    );
    return reply.send({ settings });
  };

  adminListWithdrawals = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const query = request.query as {
      page: number;
      limit: number;
      status?: string;
    };
    const data = await this.service.adminListWithdrawals(query);
    return reply.send(data);
  };

  adminProcessWithdrawal = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminProcessWithdrawInput;
    const data = await this.service.adminProcessWithdrawal(
      request.user!.sub,
      id,
      body,
    );
    return reply.send(data);
  };

  adminOverview = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { rangeDays?: number };
    const data = await this.service.adminOverview(query.rangeDays ?? 30);
    return reply.send({ overview: data });
  };

  adminListWallets = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as AdminWalletsListQuery;
    const data = await this.service.adminListWallets(query);
    return reply.send(data);
  };

  adminGetWallet = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.adminGetWallet(id);
    return reply.send(data);
  };

  adminListTransactions = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const query = request.query as AdminTransactionsListQuery;
    const data = await this.service.adminListTransactions(query);
    return reply.send(data);
  };

  adminGetTransaction = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const { id } = request.params as { id: string };
    const data = await this.service.adminGetTransaction(id);
    return reply.send(data);
  };

  adminListDeposits = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as AdminDepositsListQuery;
    const data = await this.service.adminListDeposits(query);
    return reply.send(data);
  };

  adminAdjustWallet = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminAdjustInput;
    const adminLabel =
      request.user?.email?.trim() || request.user?.sub || 'admin';
    const data = await this.service.adminAdjustWallet(adminLabel, id, body);
    return reply.send(data);
  };
}
