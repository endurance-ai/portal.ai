import type {NextConfig} from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "encrypted-tbn*.gstatic.com" },
      { protocol: "https", hostname: "*.ggpht.com" },
      { protocol: "https", hostname: "serpapi.com" },
      { protocol: "https", hostname: "*.google.com" },
      // Cafe24 이미지 CDN
      { protocol: "https", hostname: "cafe24img.poxo.com" },
      { protocol: "https", hostname: "cafe24.poxo.com" },
      { protocol: "https", hostname: "ecimg.cafe24img.com" },
      { protocol: "https", hostname: "**.cafe24.com" },
      // 편집샵/브랜드몰
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
      { protocol: "https", hostname: "mardimercredi.com" },
      { protocol: "https", hostname: "bastong.co.kr" },
      { protocol: "https", hostname: "beslow.co.kr" },
      { protocol: "https", hostname: "blankroom.house" },
      { protocol: "https", hostname: "chanceclothing.co.kr" },
      { protocol: "https", hostname: "havatishop.com" },
      { protocol: "https", hostname: "roughside.co.kr" },
      { protocol: "https", hostname: "sienneboutique.com" },
      { protocol: "https", hostname: "takeastreet.com" },
      // R2 CDN
      { protocol: "https", hostname: "pub-dddeb1e14cdf428caa5cfbad8e1f98da.r2.dev" },
    ],
  },
}

export default nextConfig
