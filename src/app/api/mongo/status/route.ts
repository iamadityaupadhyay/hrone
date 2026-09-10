import { NextResponse } from 'next/server';
import clientPromise, { getDatabase } from '@/lib/mongodb';

export async function GET() {
  const startTime = Date.now();
  try {
    const client = await clientPromise;
    const db = await getDatabase();

    // Ping the deployment to confirm connection
    await client.db().admin().command({ ping: 1 });
    const latency = Date.now() - startTime;

    let databases: string[] = [];
    try {
      const adminDb = client.db().admin();
      const dbs = await adminDb.listDatabases();
      databases = dbs.databases.map((d) => d.name);
    } catch {
      // Some Atlas users may have restricted admin permissions
      databases = [db.databaseName];
    }

    return NextResponse.json({
      success: true,
      status: 'Connected',
      latencyMs: latency,
      activeDatabase: db.databaseName,
      databases,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    return NextResponse.json(
      {
        success: false,
        status: 'Error',
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
