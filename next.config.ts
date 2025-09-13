import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.unsplash.com',
        port: '',
        pathname: '/**',
      },
      // Add other image domains you might use for news articles
      {
        protocol: 'https',
        hostname: 'cdn.cnn.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'assets.rappler.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.abs-cbn.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.gmanetwork.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.inquirer.net',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.philstar.com',
        port: '',
        pathname: '/**',
      },
      // Wildcard for any other news image sources
      {
        protocol: 'https',
        hostname: '*',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;