import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDatabase();
    const items = await db
      .collection('test_items')
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    return NextResponse.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch items';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const newItem = {
      title: title.trim(),
      description: description ? String(description).trim() : '',
      createdAt: new Date(),
    };

    const result = await db.collection('test_items').insertOne(newItem);

    return NextResponse.json(
      {
        success: true,
        message: 'Document inserted successfully',
        insertedId: result.insertedId,
        item: { _id: result.insertedId, ...newItem },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create item';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Item ID is required' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const { ObjectId } = await import('mongodb');

    let filter;
    try {
      filter = { _id: new ObjectId(id) };
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid ObjectId format' },
        { status: 400 }
      );
    }

    const result = await db.collection('test_items').deleteOne(filter);

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete item';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
