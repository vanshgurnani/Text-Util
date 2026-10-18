import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000'
).replace(/\/$/, '');

async function proxyMcp(req: NextRequest) {
  const backendMcpUrl = `${BACKEND_URL}/mcp`;

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
      ? await req.text()
      : undefined;

    const backendRes = await fetch(backendMcpUrl, {
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

    // Ensure wide-open CORS so external MCP clients can connect freely
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    resHeaders.set('Access-Control-Allow-Headers', '*');

    const resBody = await backendRes.text();
    return new NextResponse(resBody, {
      status: backendRes.status,
      headers: resHeaders,
    });
  } catch (error) {
    console.error('MCP Proxy Error:', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Failed to connect to NoteOS backend',
          data: error instanceof Error ? error.message : String(error),
        },
      },
      {
        status: 502,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      }
    );
  }
}

export async function POST(req: NextRequest) {
  return proxyMcp(req);
}

export async function GET(req: NextRequest) {
  return proxyMcp(req);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
}
