/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['child_process', 'fs', 'os', 'path', 'util'],
}

module.exports = nextConfig
