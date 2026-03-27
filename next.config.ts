import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        buffer: false,
      };
    }
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
    });
    return config;
  },
  serverExternalPackages: [
    '@solana/web3.js',
    '@solana/spl-token',
    '@meteora-ag/cp-amm-sdk',
    '@meteora-ag/dynamic-amm-sdk',
    '@meteora-ag/m3m3',
    '@meteora-ag/alpha-vault',
    '@cora-xyz/anchor-0.28.0',
    '@coral-xyz/anchor',
    '@metaplex-foundation/mpl-token-metadata',
  ],
};

export default nextConfig;
