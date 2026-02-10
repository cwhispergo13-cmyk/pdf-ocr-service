/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '150mb',
    },
  },
}

module.exports = nextConfig
