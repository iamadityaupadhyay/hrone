import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { getSubscriptionSettings, updateSubscriptionSettings } from '@/lib/db/settings';
import { getAllEmployees } from '@/lib/db/employees';
import { resolveSubscription } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getSubscriptionSettings();
    const allEmps = await getAllEmployees();

    let proCount = 0;
    let basicCount = 0;
    let trialCount = 0;
    let expiredCount = 0;
    let compedCount = 0;

    for (const emp of allEmps) {
      const sub = resolveSubscription(emp, true); // Evaluate as if enforced for true stats
      if (sub.isComped) compedCount++;
      else if (sub.status === 'TRIAL') trialCount++;
      else if (sub.status === 'EXPIRED') expiredCount++;
      else if (sub.plan === 'PRO_149') proCount++;
      else if (sub.plan === 'BASIC_99') basicCount++;
    }

    const mrr = proCount * 149 + basicCount * 99;

    return NextResponse.json({
      success: true,
      settings,
      stats: {
        totalEmployees: allEmps.length,
        compedCount,
        trialCount,
        proCount,
        basicCount,
        expiredCount,
        mrr,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve subscription settings';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { enforced, trialDaysDefault = 7, resetAllTrials = false } = body;

    if (typeof enforced !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Field "enforced" (boolean) is required.' },
        { status: 400 }
      );
    }

    const updated = await updateSubscriptionSettings({
      enforced,
      trialDaysDefault,
      updatedBy: 'Admin UI',
    });

    const db = await getDatabase();
    let resetCount = 0;

    // When activating and admin chooses to reset trials starting today:
    if (enforced && resetAllTrials) {
      const now = new Date();
      const trialExpiry = new Date(now.getTime() + trialDaysDefault * 24 * 60 * 60 * 1000).toISOString();

      const result = await db.collection('employees').updateMany(
        {
          isSuperAdmin: { $ne: true },
          'subscription.isComped': { $ne: true },
        },
        {
          $set: {
            'subscription.plan': 'PRO_149',
            'subscription.status': 'TRIAL',
            'subscription.validUntil': trialExpiry,
            'subscription.activatedAt': now.toISOString(),
            'subscription.amountPaid': 0,
            'subscription.isComped': false,
            updatedAt: now.toISOString(),
          },
        }
      );
      resetCount = result.modifiedCount;
    }

    const modeText = enforced ? 'ACTIVATED' : 'DEACTIVATED';
    return NextResponse.json({
      success: true,
      settings: updated,
      resetCount,
      message: `Subscription model successfully ${modeText}.${resetCount > 0 ? ` Reset ${resetCount} employees to a fresh ${trialDaysDefault}-day free trial.` : ''}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update subscription settings';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

