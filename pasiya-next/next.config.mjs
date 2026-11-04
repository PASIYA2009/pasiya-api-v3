// The dashboard is a plain static page (public/index.html); everything under /api is the Next.js route handler.
export default {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/', destination: '/index.html' }];
  }
};
