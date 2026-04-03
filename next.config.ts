import type {NextConfig} from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "encrypted-tbn*.gstatic.com" },
      { protocol: "https", hostname: "*.ggpht.com" },
      { protocol: "https", hostname: "serpapi.com" },
      { protocol: "https", hostname: "*.google.com" },
      { protocol: "https", hostname: "cafe24img.poxo.com" },
      { protocol: "https", hostname: "*.cafe24.com" },
      { protocol: "https", hostname: "**.cafe24.com" },
      { protocol: "https", hostname: "shopamomento.com" },
      { protocol: "https", hostname: "adekuver.com" },
      { protocol: "https", hostname: "etcseoul.com" },
      { protocol: "https", hostname: "slowsteadyclub.com" },
      { protocol: "https", hostname: "visualaid.kr" },
      { protocol: "https", hostname: "iamshop-online.com" },
      { protocol: "https", hostname: "sculpstore.com" },
      { protocol: "https", hostname: "www.8division.com" },
      { protocol: "https", hostname: "fr8ight.co.kr" },
      { protocol: "https", hostname: "heights-store.com" },
      { protocol: "https", hostname: "empty.seoul.kr" },
      { protocol: "https", hostname: "llud.co.kr" },
      { protocol: "https", hostname: "obscura-store.com" },
      { protocol: "https", hostname: "samplas.co.kr" },
      { protocol: "https", hostname: "*.obscura-store.com" },
      { protocol: "https", hostname: "*.samplas.co.kr" },
    ],
  },
}

export default nextConfig
