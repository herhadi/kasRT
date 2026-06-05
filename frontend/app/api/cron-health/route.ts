import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "";
  const cronSecret = process.env.CRON_SECRET || "";

  if (!baseUrl) {
    return NextResponse.json({
      ok: false,
      service: "frontend",
      timestamp: new Date().toISOString(),
      message: "Backend URL belum dikonfigurasi"
    });
  }

  try {
    const response = await fetch(`${baseUrl}/management/cron/ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cronSecret ? { "x-cron-secret": cronSecret } : {})
      },
      body: JSON.stringify({
        job_name: "vercel-cron-health",
        source: "frontend-api-cron-health",
        status: "OK",
        message: "Manual cron health endpoint terpanggil",
        payload: {
          timestamp: new Date().toISOString()
        }
      })
    });

    const pingResult = await response.json().catch(() => ({ success: false, message: "Invalid response" }));

    return NextResponse.json({
      ok: response.ok,
      service: "frontend",
      timestamp: new Date().toISOString(),
      ping_result: pingResult
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      service: "frontend",
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Cron health request gagal"
    });
  }
}

