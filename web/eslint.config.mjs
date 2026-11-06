import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  // Generated from Foundry artifacts by contracts/script/export-web.mjs; never hand-edited.
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "lib/contracts/**"] },
];

export default config;
