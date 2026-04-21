/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas", "mongodb"],
  },
  async headers() {
    return [
      {
        source: "/:slug/current.bmp",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Content-Type", value: "image/bmp" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
