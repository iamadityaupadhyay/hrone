import { deleteEmployee, getEmployeeById, upsertEmployee } from '@/lib/db/employees';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, employee });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching employee';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const existing = await getEmployeeById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    const body = await req.json();
    const updated = {
      ...existing,
      ...body,
      _id: existing._id,
      schedule: {
        ...existing.schedule,
        ...(body.schedule || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    await upsertEmployee(updated);
    return NextResponse.json({ success: true, message: 'Employee updated successfully' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating employee';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const deleted = await deleteEmployee(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Employee not found or delete failed' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Employee deleted' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error deleting employee';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
