import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentKind, Prisma } from '@prisma/client';

/**
 * 모의 PG.
 * - 멱등성: idempotencyKey가 같은 요청은 기존 결제를 그대로 반환 (중복 과금 방지)
 * - 결제 상태 머신: PENDING → CAPTURED | FAILED, CAPTURED → REFUNDED
 * - 카드 뒤 4자리가 '0000'이면 승인 거절 (실패 플로우 데모용)
 */
@Injectable()
export class PaymentsService {
  async charge(
    tx: Prisma.TransactionClient,
    input: {
      reservationId: string;
      kind: PaymentKind;
      amountKrw: number;
      idempotencyKey: string;
      cardLast4: string;
    },
  ) {
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.status === 'CAPTURED') return existing;
      throw new BadRequestException('이미 처리 중이거나 실패한 결제입니다. 새로 시도해 주세요');
    }

    const payment = await tx.payment.create({
      data: {
        reservationId: input.reservationId,
        kind: input.kind,
        amountKrw: input.amountKrw,
        idempotencyKey: input.idempotencyKey,
        cardLast4: input.cardLast4,
        status: 'PENDING',
      },
    });

    if (input.cardLast4 === '0000') {
      // 실제 PG라면 여기서 실패 레코드가 남지만, 예약 트랜잭션과 함께 롤백되는 것이
      // 데모에서는 더 단순하다 — 실패 사유만 예외로 전달한다.
      throw new BadRequestException('카드 승인이 거절되었습니다 (모의 PG: 0000 카드)');
    }

    return tx.payment.update({
      where: { id: payment.id },
      data: { status: 'CAPTURED', approvedAt: new Date() },
    });
  }

  async refundAll(tx: Prisma.TransactionClient, reservationId: string) {
    await tx.payment.updateMany({
      where: { reservationId, status: 'CAPTURED' },
      data: { status: 'REFUNDED' },
    });
  }
}
