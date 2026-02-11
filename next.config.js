/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['child_process', 'fs', 'os', 'path', 'util'],
  // 빌드 시간 단축: 프로덕션 소스맵 비활성화
  productionBrowserSourceMaps: false,
}

module.exports = nextConfig
