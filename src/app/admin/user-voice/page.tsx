import { UserVoiceDashboard } from "@/components/admin/user-voice-dashboard"

export default function UserVoicePage() {
  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">유저 보이스</h1>
        <p className="text-sm text-muted-foreground mt-1">유저 피드백, 리파인 여정, 이메일 수집 현황</p>
      </div>
      <UserVoiceDashboard />
    </div>
  )
}
