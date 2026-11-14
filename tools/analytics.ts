export const analyticsScript = 'https://cloud.umami.is/script.js';
export const analyticsWebsite = 'eabaebc4-23e4-4d1e-a5d4-58aa6ebbb443';

export function withAnalytics(html: string, publicPaths: string[]) {
  const paths = JSON.stringify(publicPaths).replaceAll('<', '\\u003c');
  const guard = `(function(){
    var paths=new Set(${paths});
    window.rightuiAnalyticsBeforeSend=function(type,payload){
      try{
        if(type!=="event"||location.hostname!=="rightui.dev"||window.top!==window)return null;
        var url=new URL(payload.url,location.origin);
        if(url.origin!==location.origin||!paths.has(url.pathname.replace(/\\/+$/,"")||"/"))return null;
        return payload;
      }catch(_){return null;}
    };
  })();`;
  const markup = `<script data-rightui-analytics="guard">${guard}</script>\n<script data-rightui-analytics="tracker" defer src="${analyticsScript}" data-website-id="${analyticsWebsite}" data-domains="rightui.dev" data-before-send="rightuiAnalyticsBeforeSend" data-exclude-search="true" data-exclude-hash="true"></script>\n`;
  const clean = html.replace(/<script\b[^>]*\bdata-rightui-analytics="[^"]*"[^>]*>[\s\S]*?<\/script>\n?/g, '');
  const boundary = clean.includes('</head>') ? '</head>' : '<div id="exact-root">';
  if (!clean.includes(boundary)) throw new Error('Analytics head boundary changed.');
  return clean.replace(boundary, markup + boundary);
}
