/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['child_process', 'fs', 'os', 'path', 'util'],
}

module.exports = nextConfig
