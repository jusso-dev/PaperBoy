import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...Object.values(nextConfig),
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "sdks/**"],
  },
];

export default eslintConfig;
