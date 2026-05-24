import { Polar } from "@polar-sh/sdk";

export type PolarPlanId = "pro" | "unlimited";

export const PLAN_PRODUCT_IDS: Record<PolarPlanId, string | undefined> = {
  pro: process.env.POLAR_PRODUCT_ID_PRO,
  unlimited: process.env.POLAR_PRODUCT_ID_UNLIMITED,
};

export const PLAN_LABELS: Record<PolarPlanId | "free", string> = {
  free: "Free",
  pro: "Pro",
  unlimited: "Unlimited",
};

export function planIdFromProductId(productId: string | null | undefined): PolarPlanId | null {
  if (!productId) return null;
  for (const [plan, id] of Object.entries(PLAN_PRODUCT_IDS) as [PolarPlanId, string | undefined][]) {
    if (id && id === productId) return plan;
  }
  return null;
}

export function createPolarClient() {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("POLAR_ACCESS_TOKEN is not configured");
  }
  const server = process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
  return new Polar({ accessToken, server });
}
