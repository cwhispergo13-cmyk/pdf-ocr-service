/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['child_process', 'fs', 'os', 'path', 'util'],
  productionBrowserSourceMaps: false,
  // 개당 20MB 업로드 허용을 위한 요청 body 크기 제한
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
}

module.exports = nextConfig
