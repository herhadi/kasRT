import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "";
  const cronSecret = process.env.CRON_SECRET || "";

  let reminderResult: unknown = { skipped: true, message: "Backend URL belum dikonfigurasi" };
  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/jimpitan/send-shift-reminder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cronSecret ? { "x-cron-secret": cronSecret } : {})
        }
      });
      reminderResult = await response.json().catch(() => ({ success: false, message: "Invalid response" }));
    } catch (error) {
      reminderResult = {
        success: false,
        message: error instanceof Error ? error.message : "Cron request gagal"
      };
    }
  }

  let healthResult: unknown = { skipped: true, message: "Backend URL belum dikonfigurasi" };
  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/management/cron/ping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cronSecret ? { "x-cron-secret": cronSecret } : {})
        },
        body: JSON.stringify({
          job_name: "vercel-cron",
          source: "frontend-api-cron",
          status: "OK",
          message: "Vercel cron endpoint terpanggil",
          payload: {
            timestamp: new Date().toISOString(),
            reminder_result: reminderResult
          }
        })
      });
      healthResult = await response.json().catch(() => ({ success: false, message: "Invalid response" }));
    } catch (error) {
      healthResult = {
        success: false,
        message: error instanceof Error ? error.message : "Cron health ping gagal"
      };
    }
  }

  return NextResponse.json(
    {
      ok: true,
      service: "frontend",
      timestamp: new Date().toISOString(),
      reminder_result: reminderResult,
      health_result: healthResult
    },
    { status: 200 }
  );
}
