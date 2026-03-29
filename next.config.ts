import type {NextConfig} from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "encrypted-tbn*.gstatic.com" },
      { protocol: "https", hostname: "*.ggpht.com" },
      { protocol: "https", hostname: "serpapi.com" },
      { protocol: "https", hostname: "*.google.com" },
    ],
  },
}

export default nextConfig
