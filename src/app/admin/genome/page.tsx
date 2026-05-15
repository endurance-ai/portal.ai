import {redirect} from "next/navigation"

// 옛 /admin/genome → /admin/brand-nodes 로 이전 (사이드바 "브랜드 노드" rename).
export default function GenomePage() {
  redirect("/admin/brand-nodes")
}
