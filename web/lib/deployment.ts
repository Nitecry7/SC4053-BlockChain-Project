import { deployments } from "./contracts/deployments";

export type Deployment = (typeof deployments)[keyof typeof deployments];

/** Chains the app supports: exactly those with an exported deployment (see contracts/script/export-web.mjs). */
export const SUPPORTED_CHAIN_IDS: readonly number[] = Object.keys(deployments).map(Number);

export const PRIMARY_DEPLOYMENT: Deployment = deployments[31337];

export function getDeployment(chainId: number | undefined): Deployment | undefined {
  if (chainId === undefined) return undefined;
  return (deployments as Record<number, Deployment>)[chainId];
}
