import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "";
  const cronSecret = process.env.CRON_SECRET || "";
  const { searchParams } = new URL(request.url);
  const shiftDay = searchParams.get("shift_day") || "";

  if (!baseUrl) {
    return NextResponse.json({
      ok: false,
      service: "frontend",
      timestamp: new Date().toISOString(),
      message: "Backend URL belum dikonfigurasi"
    });
  }

  try {
    const query = new URLSearchParams({ test: "true" });
    if (shiftDay) query.set("shift_day", shiftDay);
    const response = await fetch(`${baseUrl}/jimpitan/send-shift-reminder?${query.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cronSecret ? { "x-cron-secret": cronSecret } : {})
      }
    });
    const reminderResult = await response.json().catch(() => ({ success: false, message: "Invalid response" }));

    return NextResponse.json({
      ok: response.ok,
      service: "frontend",
      timestamp: new Date().toISOString(),
      reminder_result: reminderResult
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      service: "frontend",
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Cron reminder test gagal"
    });
  }
}
