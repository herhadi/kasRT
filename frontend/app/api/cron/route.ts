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

  return NextResponse.json(
    {
      ok: true,
      service: "frontend",
      timestamp: new Date().toISOString(),
      reminder_result: reminderResult
    },
    { status: 200 }
  );
}
