"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AnalysisTable } from "@/components/admin/analysis-table"
import { ActivityCharts } from "@/components/admin/activity-charts"

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="analyses">
        <TabsList>
          <TabsTrigger value="analyses">분석 기록</TabsTrigger>
          <TabsTrigger value="activity">활동</TabsTrigger>
        </TabsList>

        <TabsContent value="analyses" className="mt-4">
          <AnalysisTable />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <ActivityCharts />
        </TabsContent>
      </Tabs>
    </div>
  )
}
