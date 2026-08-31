import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: true,

  // Prisma's generated runtime resolves its query engine through dynamic
  // filesystem access. Bundling it makes the build tracer pull the whole
  // project into the server output; leaving it external keeps the deployed
  // bundle small and lets Prisma load its engine normally.
  serverExternalPackages: ['@prisma/client', '.prisma/client'],

  // The seed reads the supplied fixture file at runtime so that the reset
  // endpoint works on a deployed preview.
  outputFileTracingIncludes: {
    '/api/dev/reset': ['./fixtures/**'],
  },
}

export default nextConfig
