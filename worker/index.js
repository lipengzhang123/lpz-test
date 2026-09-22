// Cloudflare Workers - 钉钉免登鉴权后端
// 部署后需在 Settings -> Variables 中配置环境变量:
// APP_KEY, APP_SECRET, TARGET_CORP_ID
// 并绑定 KV Namespace: DINGTALK_KV

const DINGTALK_TOKEN_URL = 'https://oapi.dingtalk.com/gettoken';
const DINGTALK_USERINFO_URL = 'https://oapi.dingtalk.com/topapi/v2/user/getuserinfo';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const origin = request.headers.get('Origin') || '';
    const ua = request.headers.get('User-Agent') || '';

    // 【关键】Worker 层环境拦截（优先级最高）
    const isDingTalk = /DingTalk|AliApp\(DT/.test(ua);
    if (!isDingTalk && (pathname === '/' || pathname === '')) {
      return new Response(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>请在钉钉中打开</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#f5f7fa;"><div style="text-align:center;padding:2rem;"><h2 style="font-size:1.5rem;color:#1a1a1a;margin-bottom:1rem;">⚠️ 请在钉钉中打开</h2><p style="color:#666;line-height:1.8;">本平台仅支持在钉钉客户端内访问<br>请将链接复制到钉钉中重新打开</p></div></body></html>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 【关键】GitHub Pages 静态资源代理（必须在 API 路由之前）
    if (pathname === '/' || pathname === '' || pathname === '/v2' || pathname === '/v3' ||
        pathname.startsWith('/css/') || pathname.startsWith('/js/') || 
        pathname.startsWith('/assets/') || pathname.startsWith('/data/') || pathname.endsWith('.html')) {
      // /v2 → category_v2.html, /v3 → index.html (未来扩展), 其他保持原样
      let ghPath = pathname;
      if (pathname === '/v2') {
        ghPath = '/category_v2.html';
      } else if (pathname === '/' || pathname === '') {
        ghPath = '/index.html';
      }
      const ghUrl = 'https://lipengzhang123.github.io/lpz-test' + ghPath + '?_v=' + Date.now();
      try {
        const resp = await fetch(ghUrl, { cf: { cacheTtl: 0 } });
        
        // 【关键】禁止钉钉WebView缓存HTML和JS
        const newHeaders = new Headers(resp.headers);
        if (pathname === '/' || pathname === '' || pathname === '/v2' || pathname === '/v3' || pathname.endsWith('.html') || pathname.startsWith('/js/')) {
          newHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
          newHeaders.set('Pragma', 'no-cache');
          newHeaders.set('Expires', '0');
        }
        
        return new Response(resp.body, {
          status: resp.status,
          headers: newHeaders
        });
      } catch (e) {
        console.error('[Proxy] Failed to fetch from GitHub Pages:', e.message);
        return jsonResponse({ error: 'Upstream Error' }, 502);
      }
    }

    // 【安全】来源校验已移除（由钉钉Token鉴权保障安全）

    // 【关键】处理 OPTIONS 预检请求（钉钉内置浏览器必需）
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // 获取 Access Token（带内存缓存 + KV 兜底）
    const accessToken = await getAccessToken(env);

    // 路由分发
    if (url.pathname === '/api/dingtalk/auth' && request.method === 'POST') {
      return handleAuth(request, env, accessToken);
    }

    if (url.pathname === '/api/getCase' && request.method === 'GET') {
      return handleGetCase(request, env);
    }

    // 【新增】实时查询AI表格案例数据
    if (url.pathname === '/api/cases' && request.method === 'GET') {
      return handleCasesRealtime(request, env, accessToken);
    }

    return jsonResponse({ errcode: 404, errmsg: 'Not Found' }, 404);
  }
};

// 统一 JSON 响应工厂（所有错误都返回 JSON）
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// 【并发安全】Token 获取逻辑（内存缓存优先，避免频繁调用钉钉）
async function getAccessToken(env) {
  // 内存缓存（Worker 实例级别，10分钟有效）
  if (globalThis._cachedToken && Date.now() < globalThis._tokenExpire) {
    return globalThis._cachedToken;
  }

  // KV 兜底
  let token = await env.DINGTALK_KV.get('access_token');
  if (token) {
    globalThis._cachedToken = token;
    globalThis._tokenExpire = Date.now() + 600000;
    return token;
  }

  // 调用钉钉接口
  try {
    const res = await fetch(
      `${DINGTALK_TOKEN_URL}?appkey=${env.APP_KEY}&appsecret=${env.APP_SECRET}`
    );
    const data = await res.json();

    if (data.errcode !== 0) {
      throw new Error(`DingTalk API Error: ${data.errmsg} (${data.errcode})`);
    }

    token = data.access_token;

    // 写入 KV（7000秒过期，钉钉官方建议）
    await env.DINGTALK_KV.put('access_token', token, { expirationTtl: 7000 });

    // 更新内存缓存
    globalThis._cachedToken = token;
    globalThis._tokenExpire = Date.now() + 600000;

    return token;
  } catch (e) {
    console.error('Failed to get access token:', e.message);
    throw e;
  }
}

// 免登鉴权接口
async function handleAuth(request, env, token) {
  try {
    const body = await request.json();
    const { authCode, corpId } = body;

    if (!authCode) {
      return jsonResponse({ errcode: 400, errmsg: 'Missing authCode' }, 400);
    }

    // 【安全】校验企业身份
    if (corpId && corpId !== env.TARGET_CORP_ID) {
      return jsonResponse({ errcode: 403, errmsg: 'Invalid CorpId' }, 403);
    }

    // 调用钉钉获取用户信息
    const res = await fetch(DINGTALK_USERINFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, code: authCode })
    });
    const data = await res.json();

    // 【安全】检查钉钉接口错误码
    if (data.errcode !== 0) {
      return jsonResponse(data, 502);
    }

    // 生成会话凭证
    const sessionId = crypto.randomUUID();
    await env.DINGTALK_KV.put(
      `session:${sessionId}`,
      JSON.stringify(data.result),
      { expirationTtl: 3600 }
    );

    return jsonResponse({
      errcode: 0,
      sessionId,
      userid: data.result.userid,
      name: data.result.name
    });
  } catch (e) {
    return jsonResponse({ errcode: 500, errmsg: e.message }, 500);
  }
}

// 业务数据接口（需鉴权）
async function handleGetCase(request, env) {
  // 从 Cookie 读取 Session（比 localStorage 更安全）
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/sessionId=([^;]+)/);
  const sessionId = match ? match[1] : null;

  if (!sessionId) {
    return jsonResponse({ errcode: 401, errmsg: 'Missing Session' }, 401);
  }

  const userJson = await env.DINGTALK_KV.get(`session:${sessionId}`);
  if (!userJson) {
    return jsonResponse({ errcode: 401, errmsg: 'Session Expired' }, 401);
  }

  // 从 KV 读取案例数据（可替换为钉钉多维表格 API）
  const casesJson = await env.DINGTALK_KV.get('cases_data');
  const cases = casesJson ? JSON.parse(casesJson) : [];

  return jsonResponse({ errcode: 0, data: cases });
}

// 【新增】实时查询AI表格案例数据（无需鉴权，公开访问）
async function handleCasesRealtime(request, env, token) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const size = parseInt(url.searchParams.get('size') || '20');
    const tag = url.searchParams.get('tag') || '';

    // 使用环境变量中的OPERATOR_ID（钉钉WebView Cookie不可靠，改用固定operatorId）
    const operatorId = env.OPERATOR_ID;
    console.log('[AITable] Using OPERATOR_ID from env:', operatorId);

    // 调用钉钉AI表格API查询记录（GET请求，需传入operatorId）
    const aitableUrl = `https://api.dingtalk.com/v1.0/notable/bases/${env.AITABLE_BASE_ID}/sheets/${env.AITABLE_TABLE_ID}/records?operatorId=${encodeURIComponent(operatorId)}`;
    const res = await fetch(aitableUrl, {
      method: 'GET',
      headers: {
        'x-acs-dingtalk-access-token': token
      }
    });

    const data = await res.json();
    
    // 【调试】记录原始API响应
    console.log('[AITable] Raw response:', JSON.stringify(data));

    if (data.errorCode) {
      console.error('[AITable] API Error:', data);
      return jsonResponse({ errcode: 502, errmsg: data.errorMessage || 'AITable API Error', debug: data }, 502);
    }

    // 【调试】检查响应结构
    const debugInfo = {
      allKeys: Object.keys(data),
      resultKeys: data.result ? Object.keys(data.result) : null,
      hasRecords: !!data.result?.records,
      recordCount: data.result?.records?.length || 0,
      totalCount: data.result?.totalCount,
      fullResponse: JSON.stringify(data).substring(0, 1000),
      operatorId: operatorId
    };
    console.log('[AITable] Debug info:', debugInfo);

    // 转换字段格式（与同步脚本逻辑一致）
    const CATEGORY_CODE_MAP = {
      "bJdSTtzMUW": "yield", "e6sP6sLGsf": "substitute", "Tirvo6R5pZ": "reduce",
      "sjo1yrAhRv": "headcount", "2qPo9wD43L": "hours", "aZGSARYjqt": "utilities",
      "tlSppxad6o": "auxiliary", "Uo44qZUI1A": "spare_parts", "BWGbmRyWxV": "indirect_staff"
    };
    const CATEGORY_NAME_MAP = {
      "yield": "良率改善", "substitute": "材料替代", "reduce": "用量降低",
      "headcount": "人数优化", "hours": "工时优化", "utilities": "水电气",
      "auxiliary": "辅料", "spare_parts": "备件", "indirect_staff": "间接人员"
    };
    const FIELD_MAP = {
      "title": "MS8cFpk", "category_id": "yqo08Rp", "company": "HaEWw6Q",
      "level_id": "noJlzRG", "date": "320X8MN", "tags": "bXPiAq4",
      "cover": "QhNdlR8", "summary": "J7G36oG", "approach": "YxuDAfu", "results": "RraZcE8"
    };

    const records = data.result?.records || [];
    const cases = records.map((record, index) => {
      const cells = record.cells || {};
      const categoryId = cells[FIELD_MAP.category_id]?.id || "";
      const categoryCode = CATEGORY_CODE_MAP[categoryId] || "yield";
      const tagsData = cells[FIELD_MAP.tags] || [];
      const tags = Array.isArray(tagsData) ? tagsData.map(t => t.name || "").filter(Boolean) : [];
      const approachMd = cells[FIELD_MAP.approach]?.markdown || "";
      const resultsMd = cells[FIELD_MAP.results]?.markdown || "";
      const summary = (cells[FIELD_MAP.summary]?.markdown || "").trim();

      // 解析approach为列表
      const approach = approachMd.split(/\n\s*\n/).filter(p => p.trim()).map(p => {
        p = p.trim();
        return p.startsWith('• ') || p.startsWith('- ') ? p.substring(2).trim() : p;
      });

      // 解析results
      const results = [];
      if (resultsMd) {
        const items = resultsMd.split(/•\s*/).filter(i => i.trim());
        for (const item of items) {
          const match = item.match(/^([^\d]*?)\s*([\d][\d.%万→\-]*)\s*(.*?)$/);
          if (match) {
            const label = `${match[1].trim()} ${match[3].trim()}`.trim();
            results.push({ num: match[2].trim(), label: label || match[2].trim() });
          } else {
            results.push({ num: item.trim(), label: "" });
          }
        }
      }

      // 格式化日期
      let dateStr = cells[FIELD_MAP.date] || "";
      try {
        dateStr = new Date(dateStr.replace('+08:00', '+0800')).toISOString().slice(0, 7);
      } catch {}

      return {
        id: (page - 1) * size + index + 1,
        title: cells[FIELD_MAP.title] || "",
        category: categoryCode,
        categoryName: CATEGORY_NAME_MAP[categoryCode] || "良率改善",
        company: cells[FIELD_MAP.company] || "",
        level: cells[FIELD_MAP.level_id]?.name || "",
        date: dateStr,
        tags,
        cover: cells[FIELD_MAP.cover] || "",
        images: [],
        summary,
        approach,
        results
      };
    });

    return jsonResponse({
      errcode: 0,
      data: cases,
      total: data.result?.totalCount || records.length,
      page,
      size,
      _debug: debugInfo
    });
  } catch (e) {
    console.error('[AITable] Exception:', e.message);
    return jsonResponse({ errcode: 500, errmsg: e.message }, 500);
  }
}
