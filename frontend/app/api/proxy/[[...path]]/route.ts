import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000'
).replace(/\/$/, '');

async function proxyRequest(
  req: NextRequest,
  { params }: { params: { path?: string[] } }
) {
  const pathSegments = params?.path || [];
  const targetPath = '/' + pathSegments.join('/');
  const search = req.nextUrl.search || '';
  const targetUrl = `${BACKEND_URL}${targetPath}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Exclude hop-by-hop headers
    if (!['host', 'connection', 'content-length', 'transfer-encoding'].includes(lowerKey)) {
      headers.set(key, value);
    }
  });

  try {
    const body = req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.arrayBuffer()
      : undefined;

    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
    });

    const resHeaders = new Headers();
    backendRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(lowerKey)) {
        resHeaders.set(key, value);
      }
    });

    const resBuffer = await backendRes.arrayBuffer();
    return new NextResponse(resBuffer, {
      status: backendRes.status,
      headers: resHeaders,
    });
  } catch (error) {
    console.error(`API Proxy Error [${req.method} ${targetPath}]:`, error);
    return NextResponse.json(
      {
        detail: 'Failed to communicate with NoteOS backend service',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function PUT(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function HEAD(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxyRequest(req, ctx);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
