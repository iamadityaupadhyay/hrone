import { EmployeeProfile, EmployeeSubscription, SubscriptionPlan, SubscriptionStatus } from '@/lib/types/employee';

export interface SubscriptionEvaluation {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  isValid: boolean;
  isPro: boolean;
  daysRemaining: number;
  formattedExpiry: string;
  isComped: boolean;
}

export const PLAN_PRICES = {
  BASIC_99: 99,
  PRO_149: 149,
};

// Global enforcement state (default: FALSE = DEACTIVATED / Free access for all)
let isEnforcedGlobal = false;

export function isSubscriptionEnforced(): boolean {
  return isEnforcedGlobal;
}

export function setSubscriptionEnforcedState(val: boolean) {
  isEnforcedGlobal = val;
}

/**
 * Resolves current subscription status with expiry checks and Super Admin VIP pass.
 * If global enforcement is OFF, grants full Pro access to everyone with zero restrictions.
 */
export function resolveSubscription(emp: EmployeeProfile, enforced?: boolean): SubscriptionEvaluation {
  const isEnforced = typeof enforced === 'boolean' ? enforced : isEnforcedGlobal;

  // When monetization is DEACTIVATED, all users enjoy full Pro features without restrictions
  if (!isEnforced) {
    return {
      status: 'LIFETIME_FREE',
      plan: 'PRO_149',
      isValid: true,
      isPro: true,
      daysRemaining: 9999,
      formattedExpiry: 'Unlimited (Free Mode)',
      isComped: true,
    };
  }

  // Super Admins or manually comped accounts get permanent Lifetime Free access to all Pro features
  if (emp.isSuperAdmin || emp.subscription?.isComped) {
    return {
      status: 'LIFETIME_FREE',
      plan: 'PRO_149',
      isValid: true,
      isPro: true,
      daysRemaining: 9999,
      formattedExpiry: 'Lifetime Pass',
      isComped: true,
    };
  }

  const sub = emp.subscription;

  // If no subscription record exists yet, grant a 7-day default Free Trial on Pro tier
  if (!sub || !sub.validUntil) {
    const trialDays = 7;
    const expiry = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    return {
      status: 'TRIAL',
      plan: 'PRO_149',
      isValid: true,
      isPro: true,
      daysRemaining: trialDays,
      formattedExpiry: expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      isComped: false,
    };
  }

  const expiryDate = new Date(sub.validUntil);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const isExpired = diffMs <= 0;

  const currentStatus: SubscriptionStatus = isExpired ? 'EXPIRED' : (sub.status === 'TRIAL' ? 'TRIAL' : 'ACTIVE');
  const plan: SubscriptionPlan = sub.plan || 'BASIC_99';
  const isPro = (plan === 'PRO_149' || currentStatus === 'TRIAL') && !isExpired;

  return {
    status: currentStatus,
    plan,
    isValid: !isExpired,
    isPro,
    daysRemaining,
    formattedExpiry: expiryDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    isComped: false,
  };
}

export function canUseAutopilot(emp: EmployeeProfile): boolean {
  return resolveSubscription(emp).isValid;
}

export function canUseWfh(emp: EmployeeProfile): boolean {
  const sub = resolveSubscription(emp);
  return sub.isValid && sub.isPro;
}

export function canUseRegularize(emp: EmployeeProfile): boolean {
  const sub = resolveSubscription(emp);
  return sub.isValid && sub.isPro;
}

/**
 * Returns formatted WhatsApp message displaying user's current subscription card
 */
export function formatSubscriptionMessage(emp: EmployeeProfile, upiId: string = 'aditya@upi', enforced?: boolean): string {
  const isEnforced = typeof enforced === 'boolean' ? enforced : isEnforcedGlobal;

  if (!isEnforced) {
    return (
      `🎁 *Attendance Autopilot is Free for Everyone!* 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Employee:* ${emp.name} (ID: ${emp.employeeId})\n` +
      `📊 *Status:* 🟢 *Active & Unrestricted*\n\n` +
      `All features (daily auto check-in/out, Saturday remote punch, WFH mode, and auto-regularize) are currently active with zero restrictions.\n\n` +
      `💡 _Future Plans (Preview):_\n` +
      `• *Standard (₹99/mo):* Auto-punch, Sat punch, Holiday pauses\n` +
      `• *Pro (₹149/mo):* Everything + WFH GPS Pin Mode & Regularization\n\n` +
      `👉 Reply *status* for today's card or *in* / *out* to punch.`
    );
  }

  const sub = resolveSubscription(emp, true);

  const statusBadge =
    sub.status === 'LIFETIME_FREE'
      ? '👑 *VIP Lifetime Free*'
      : sub.status === 'TRIAL'
      ? `⏳ *Free Trial* (${sub.daysRemaining} days left)`
      : sub.status === 'ACTIVE'
      ? `🟢 *Active* (${sub.daysRemaining} days left)`
      : '🔴 *Expired*';

  const planBadge = sub.plan === 'PRO_149' ? '⭐ *Pro Plan (₹149/mo)*' : '🟢 *Standard Plan (₹99/mo)*';

  const featuresText =
    sub.isPro
      ? `• ✅ Auto Check-In & Check-Out\n` +
        `• ✅ Saturday Remote Punching\n` +
        `• ✅ Official Holiday Pause\n` +
        `• ✅ WhatsApp Live Punch Cards\n` +
        `• 🏠 *Unlimited WFH GPS Pin Mode*\n` +
        `• ⚡ *Attendance Auto-Regularization*`
      : `• ✅ Auto Check-In & Check-Out\n` +
        `• ✅ Saturday Remote Punching\n` +
        `• ✅ Official Holiday Pause\n` +
        `• ✅ WhatsApp Live Punch Cards\n` +
        `• 🔒 _WFH Mode (Pro ₹149 exclusive)_\n` +
        `• 🔒 _Auto-Regularize (Pro ₹149 exclusive)_`;

  return (
    `💳 *Attendance Subscription Status*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Employee:* ${emp.name} (ID: ${emp.employeeId})\n` +
    `📦 *Current Tier:* ${planBadge}\n` +
    `📊 *Status:* ${statusBadge}\n` +
    `📅 *Valid Until:* ${sub.formattedExpiry}\n\n` +
    `✨ *Included Features:*\n` +
    `${featuresText}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Need to renew or upgrade?*\n` +
    `• *Standard (₹99/mo):* Auto check-in/out, Sat punch, Holiday alerts\n` +
    `• *Pro (₹149/mo):* Everything in Standard + WFH Mode & Regularize\n\n` +
    `👉 Send payment via UPI to: *${upiId}*\n` +
    `_After paying, reply with your transaction UTR or screenshot to activate!_`
  );
}

