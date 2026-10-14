import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') })

const apiUrl = process.env.API_URL || 'http://localhost:3001'

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    API_URL: apiUrl,
  },
  transpilePackages: ['@basecamp/shared'],
}

export default nextConfig
