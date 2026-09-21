import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDatabase();
    
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid broadcast ID' }, { status: 400 });
    }

    const broadcast = await db.collection('broadcasts').findOne({ _id: objectId });
    if (!broadcast) {
      return NextResponse.json({ success: false, error: 'Broadcast not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      broadcast: {
        id: String(broadcast._id),
        message: broadcast.message,
        target: broadcast.target,
        status: broadcast.status,
        totalRecipients: broadcast.totalRecipients || 0,
        sentCount: broadcast.sentCount || 0,
        failedCount: broadcast.failedCount || 0,
        createdAt: broadcast.createdAt,
        completedAt: broadcast.completedAt,
        results: broadcast.results || [],
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
